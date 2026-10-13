/**
 * ReAct Agent 状态定义
 *
 * 图状态（State）是 LangGraph 各节点之间唯一的通信媒介：
 * 节点读取 state，返回「状态增量」，由 reducer 决定如何合并。
 */
import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

/**
 * 用户上下文
 */
export interface UserContext {
  orgNo: string;
  orgChannelNo: string;
  orgChannelUserId: number;
  session?: string;
}

/**
 * Agent 状态定义
 * 使用 LangGraph 的 Annotation 来定义状态
 */
export const AgentState = Annotation.Root({
  // 消息列表（包含用户消息、AI消息、工具消息）
  // reducer：多个节点写入时采用「追加」语义，完整保留工具调用链
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  // 用户上下文（可选，由调用方按需注入）
  // reducer 为「覆盖」语义：后写入的值直接取代旧值
  userContext: Annotation<UserContext | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;
