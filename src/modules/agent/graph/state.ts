/**
 * ReAct Agent 状态定义
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
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  // 用户上下文
  userContext: Annotation<UserContext>(),
});

export type AgentStateType = typeof AgentState.State;
