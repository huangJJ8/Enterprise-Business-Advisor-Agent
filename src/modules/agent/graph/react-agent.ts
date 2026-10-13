/**
 * ReAct Agent 创建器
 */
import { ChatOpenAI } from '@langchain/openai';
import { StructuredToolInterface } from '@langchain/core/tools';
import { createAgent } from 'langchain';
import { AGENT_SYSTEM_PROMPT } from '../prompts/system-prompt';

/**
 * 创建 ReAct Agent
 * @param llm - LLM 实例
 * @param tools - 工具列表
 * @returns ReactAgent 实例
 */
export function createFinancialAgent({
  llm,
  tools,
}: {
  llm: ChatOpenAI;
  tools: StructuredToolInterface[];
}) {
  return createAgent({
    model: llm,
    tools,
    systemPrompt: AGENT_SYSTEM_PROMPT,
  });
}
