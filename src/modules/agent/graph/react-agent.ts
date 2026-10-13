/**
 * ReAct Agent —— 显式 LangGraph 图编排
 *
 * 这里不使用 LangChain 的 createAgent() 高层封装，而是用 LangGraph 的
 * StateGraph 手工搭建 ReAct 循环，编排结构完全显式、可读、可改：
 *
 *                     ┌──────────────┐  有 tool_calls   ┌───────────┐
 *                START ─▶   model    │ ───────────────▶ │   tools   │
 *                     └──────────────┘                  └───────────┘
 *                            │  ▲                              │
 *              无 tool_calls │  └──────────────────────────────┘
 *                            ▼          执行结果回填 messages
 *                           END
 *
 * - model 节点：把系统提示 + 历史消息交给模型，模型决定「直接回答」还是「调用工具」
 * - tools 节点：并行执行模型请求的全部工具，把结果作为 ToolMessage 写回
 * - 条件边 routeAfterModel：还有工具要调就回 tools，否则结束循环
 *
 * 对外接口（createFinancialAgent 的入参、返回值的 stream 用法）与
 * 原先的 createAgent 版本保持一致，调用方 agent.service.ts 无需改动。
 */
import { END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  StructuredToolInterface,
  ToolInputParsingException,
} from '@langchain/core/tools';
import { AGENT_SYSTEM_PROMPT } from '../prompts/system-prompt';
import { AgentState, AgentStateType } from './state';

/** 节点名（会出现在流式输出的 metadata.langgraph_node 中） */
export const MODEL_NODE = 'model';
export const TOOLS_NODE = 'tools';

/** 工具执行失败时追加的自纠错提示 */
const TOOL_ERROR_SUFFIX = '\n Please fix your mistakes.';

/** 模型给出的工具调用（取 AIMessage.tool_calls 的元素类型） */
type ToolCallRequest = NonNullable<AIMessage['tool_calls']>[number];

/**
 * 执行单个工具调用，并把结果规范化为 ToolMessage。
 *
 * 与 LangGraph 内置 ToolNode 的语义保持一致：
 *  - 工具不存在      → 返回可自纠错的错误 ToolMessage，而不是抛异常中断整个回合
 *  - 工具执行报错    → 同样转成 ToolMessage 回填，让模型有机会换参数重试
 */
async function executeToolCall(
  toolCall: ToolCallRequest,
  tools: StructuredToolInterface[],
): Promise<ToolMessage> {
  const tool = tools.find((t) => t.name === toolCall.name);

  if (!tool) {
    const available = tools.map((t) => t.name).join(', ');
    return new ToolMessage({
      content: `Error: ${toolCall.name} is not a valid tool, try one of [${available}].`,
      tool_call_id: toolCall.id ?? '',
      name: toolCall.name,
      status: 'error',
    });
  }

  try {
    const output = await tool.invoke(toolCall.args);
    if (ToolMessage.isInstance(output)) {
      return output;
    }
    return new ToolMessage({
      name: tool.name,
      content: typeof output === 'string' ? output : JSON.stringify(output),
      tool_call_id: toolCall.id ?? '',
      status: 'success',
    });
  } catch (error) {
    // 参数不符合 schema 时把原始参数一并回填，便于模型自我纠正
    if (error instanceof ToolInputParsingException) {
      const detail = error instanceof Error ? error.message : String(error);
      return new ToolMessage({
        content: `Error invoking tool '${toolCall.name}' with kwargs ${JSON.stringify(
          toolCall.args,
        )} with error: ${detail}\n Please fix the error and try again.`,
        tool_call_id: toolCall.id ?? '',
        name: toolCall.name,
        status: 'error',
      });
    }
    // 其余异常直接回填给模型，让它有机会换个思路重试
    return new ToolMessage({
      content: `${error}${TOOL_ERROR_SUFFIX}`,
      tool_call_id: toolCall.id ?? '',
      name: toolCall.name,
      status: 'error',
    });
  }
}

/**
 * 创建 ReAct Agent（显式 LangGraph 状态图）
 * @param llm - LLM 实例
 * @param tools - 工具列表
 * @returns 已编译的 LangGraph 图，用法与 createAgent 的返回值一致
 */
export function createFinancialAgent({
  llm,
  tools,
}: {
  llm: ChatOpenAI;
  tools: StructuredToolInterface[];
}) {
  // 把工具绑定到模型：由模型自主决定这一轮是否调用工具、调用哪个
  const modelWithTools =
    tools && tools.length > 0 ? llm.bindTools(tools) : llm;

  /** model 节点：注入系统提示 → 调用模型 → 把回复追加进 messages */
  const modelNode = async (state: AgentStateType) => {
    const response = await modelWithTools.invoke([
      new SystemMessage(AGENT_SYSTEM_PROMPT),
      ...state.messages,
    ]);
    return { messages: [response as BaseMessage] };
  };

  /** tools 节点：并行执行上一条 AIMessage 中的全部 tool_calls */
  const toolsNode = async (state: AgentStateType) => {
    const messages = state.messages;

    // 从后往前找到最近一条 AI 消息（可能是 AIMessage 或 AIMessageChunk）
    let lastAiMessage: AIMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (AIMessage.isInstance(messages[i])) {
        lastAiMessage = messages[i] as AIMessage;
        break;
      }
    }
    if (!lastAiMessage) {
      return { messages: [] as ToolMessage[] };
    }

    // 跳过已经执行过的 tool_call，避免重复调用
    const executedIds = new Set(
      messages
        .filter((m) => m.getType() === 'tool')
        .map((m) => (m as ToolMessage).tool_call_id),
    );
    const pendingCalls = (lastAiMessage.tool_calls ?? []).filter(
      (call) => call.id == null || !executedIds.has(call.id),
    );

    const results = await Promise.all(
      pendingCalls.map((call) => executeToolCall(call, tools)),
    );
    return { messages: results };
  };

  /** 条件边：还有待执行的工具调用就回到 tools，否则结束 */
  const routeAfterModel = (
    state: AgentStateType,
  ): typeof TOOLS_NODE | typeof END => {
    const last = state.messages[state.messages.length - 1];
    if (!last) {
      return END;
    }
    const toolCalls = (last as AIMessage).tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return TOOLS_NODE;
    }
    return END;
  };

  return new StateGraph(AgentState)
    .addNode(MODEL_NODE, modelNode)
    .addNode(TOOLS_NODE, toolsNode)
    .addEdge(START, MODEL_NODE)
    .addConditionalEdges(MODEL_NODE, routeAfterModel, [TOOLS_NODE, END])
    .addEdge(TOOLS_NODE, MODEL_NODE)
    .compile();
}
