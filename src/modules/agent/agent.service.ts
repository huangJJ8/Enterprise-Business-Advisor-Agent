/**
 * ReAct Agent 服务
 * 使用 LangGraph 的 ReAct Agent 实现自主决策
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpService } from 'src/modules-global/http/service';
import { LoggerService } from 'src/modules-global/logger/service';
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  AIMessageChunk,
  BaseMessage,
} from '@langchain/core/messages';
import {
  ConversationMessage,
  ToolCallRecord,
} from './session/session.manager';
import { AgentConfig } from './config/agent.config';
import { SessionManager } from './session/session.manager';
import { UserContext } from './graph/state';
import { createAgentTools } from './tools';
import { createFinancialAgent } from './graph/react-agent';
import { AgentApiService } from './api.service';
import { StreamChunk } from './types/agent.types';
import { UserInfo } from './types/agent.types';
import { CacheManager } from 'src/modules/upload/services/cache-manager.service';
import { AuthCheckerService } from './services/auth-checker.service';
import { OutputSanitizer } from './output';

/**
 * Agent 服务
 * 核心服务，负责初始化 LLM、工具和 ReAct Agent
 */
@Injectable()
export class AgentService implements OnModuleInit {
  private llm!: ChatOpenAI;
  private sessionManager: SessionManager;

  constructor(
    private readonly httpService: HttpService,
    private readonly agentApiService: AgentApiService,
    private readonly config: AgentConfig,
    private readonly logger: LoggerService,
    private readonly cacheManager: CacheManager,
    private readonly authCheckerService: AuthCheckerService,
  ) {
    this.sessionManager = new SessionManager(logger);
  }

  /**
   * 模块初始化
   */
  async onModuleInit() {
    this.logger.log('正在初始化 ReAct Agent 服务...');
    this.initializeLLM();
    this.logger.log('ReAct Agent 服务初始化成功');
  }

  /**
   * 初始化 LLM
   */
  private initializeLLM(): void {
    this.llm = new ChatOpenAI({
      modelName: this.config.modelName,
      apiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL,
      },
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    this.logger.log(
      `LLM 已初始化: ${this.config.modelName}, 地址: ${this.config.baseURL}`,
    );
  }

  /**
   * 处理用户查询（流式输出）
   * @param contextId 对话上下文ID
   * @param query 用户查询
   * @param userContext 用户上下文
   * @returns 返回包含 chunks 生成器和 chunksStop 方法的对象
   */
  async processQuery(
    contextId: string,
    query: string,
    userContext: UserContext,
    userInfo: UserInfo,
  ): Promise<{
    chunks: AsyncGenerator<StreamChunk, void, unknown>;
    chunksStop: () => Promise<void>;
  }> {
    this.logger.log(`正在处理会话查询: ${contextId}`);
    this.logger.log(`用户查询: ${query}`);

    // 创建 AbortController 用于控制流
    const abortController = new AbortController();

    // 保存必要的引用
    const sessionManager = this.sessionManager;
    const httpService = this.httpService;
    const agentApiService = this.agentApiService;
    const config = this.config;
    const llm = this.llm;
    const logger = this.logger;
    const cacheManager = this.cacheManager;
    const authCheckerService = this.authCheckerService;

    // 定义生成器函数
    const chunksGenerator = async function* (): AsyncGenerator<
      StreamChunk,
      void,
      unknown
    > {
      try {
        // 检查是否已被中止
        if (abortController.signal.aborted) {
          logger.log('流已被中止，不执行查询');
          return;
        }

        // 获取或创建会话
        let session = sessionManager.getSession(contextId);
        if (!session) {
          sessionManager.createSession(contextId, userContext);
          session = sessionManager.getSession(contextId)!;
        }

        // 初始化 API Service
        agentApiService.init(
          userContext,
          config.serviceUrl,
          config.dataServiceUrl,
          config.relationshipServiceUrl,
        );

        // 创建用户特定的工具
        const tools = createAgentTools({
          agentApiService,
          logger,
          config,
          userContext,
          cacheManager,
          userInfo,
          authCheckerService,
          userQuery: query,
        });

        logger.log(`已创建 ${tools.length} 个用户工具`);

        // 创建 ReAct Agent
        const agent = createFinancialAgent({ llm, tools });

        console.log('session.conversationHistory', session.conversationHistory)

        // 获取对话历史 - 完整恢复工具调用链
        const history: BaseMessage[] = [];
        for (const msg of session.conversationHistory) {
          if (msg.role === 'user') {
            history.push(new HumanMessage(msg.content));
          } else if (msg.role === 'assistant') {
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              // 带工具调用的 AI 消息
              history.push(
                new AIMessage({
                  content: msg.content || '',
                  tool_calls: msg.toolCalls.map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    args: tc.args,
                    type: 'tool_call' as const,
                  })),
                }),
              );
            } else {
              history.push(new AIMessage(msg.content));
            }
          } else if (msg.role === 'tool') {
            history.push(
              new ToolMessage({
                content: msg.content,
                tool_call_id: msg.toolCallId || '',
                name: msg.toolName,
              }),
            );
          }
        }

        // 添加当前用户消息
        const messages = [...history, new HumanMessage(query)];

        logger.log(`开始执行 Agent, 消息数: ${messages.length}`);

        // 执行 Agent（流式）
        let finalAnswer = '';
        let toolCallCount = 0;
        let hasRiskToolCall = false;

        // 输出净化：把工具名 / 字段名等内部标识符确定性地换成业务术语。
        // 提示词里那条 P0 规则靠模型自觉，这里做代码兜底。
        // 注意：会话历史写入的是净化后的内容，避免模型看到自己上一轮的泄漏表述而被强化。
        const outputSanitizer = new OutputSanitizer({ logger });

        // 熔断机制：同一工具重复调用检测
        const MAX_TOTAL_TOOL_CALLS = 15; // 单次查询最大工具调用总数
        const MAX_SAME_TOOL_CALLS = 3; // 同一工具最大连续/累计调用次数
        const toolCallCounter: Record<string, number> = {}; // 各工具调用计数
        let circuitBroken = false; // 熔断标志
        // 熔断提示语。先记录、不在此处下发 —— 净化器里可能还扣着更早的正文，
        // 直接 yield 会让提示语插到那截正文前面，顺序会乱。统一在循环结束后按序下发。
        let circuitBreakNotice = '';

        // 收集工具调用链，用于保存完整历史
        const pendingToolCalls: ToolCallRecord[] = [];
        const collectedMessages: ConversationMessage[] = [];

        // 使用 streamMode: 'messages' 获取真正的流式输出
        const stream = await agent.stream(
          { messages },
          {
            streamMode: 'messages',
            recursionLimit: 30, // 限制 ReAct 循环最大递归次数，防止无限循环
          },
        );

        for await (const [message] of stream) {
          // 检查是否被中止
          if (abortController.signal.aborted) {
            logger.log('检测到中止信号，停止处理流');
            break;
          }

          // 检查熔断
          if (circuitBroken) {
            logger.log('熔断已触发，停止处理流');
            break;
          }

          // 使用 constructor.name 来判断消息类型（更可靠）
          const messageType = message.constructor.name;

          // 处理 AI 消息（包括 AIMessage 和 AIMessageChunk）
          if (
            messageType === 'AIMessageChunk' ||
            messageType === 'AIMessage' ||
            message instanceof AIMessage ||
            message instanceof AIMessageChunk
          ) {
            const aiMessage = message as AIMessage;

            // 如果有工具调用
            if (
              'tool_calls' in aiMessage &&
              aiMessage.tool_calls &&
              aiMessage.tool_calls.length > 0
            ) {
              for (const toolCall of aiMessage.tool_calls) {
                // 只在工具调用完整时记录（有 name）
                if (toolCall.name) {
                  toolCallCount++;

                  // 熔断检测：总调用次数
                  if (toolCallCount > MAX_TOTAL_TOOL_CALLS) {
                    logger.warn(
                      `熔断触发：工具调用总次数超过上限 ${MAX_TOTAL_TOOL_CALLS}，强制终止`,
                    );
                    circuitBroken = true;
                    circuitBreakNotice =
                      '\n\n抱歉，当前查询处理步骤过多，请尝试简化您的问题或分步查询。';
                    break;
                  }

                  // 熔断检测：同一工具重复调用
                  toolCallCounter[toolCall.name] =
                    (toolCallCounter[toolCall.name] || 0) + 1;
                  if (toolCallCounter[toolCall.name] > MAX_SAME_TOOL_CALLS) {
                    logger.warn(
                      `熔断触发：工具 ${toolCall.name} 已调用 ${toolCallCounter[toolCall.name]} 次，超过上限 ${MAX_SAME_TOOL_CALLS}，强制终止`,
                    );
                    circuitBroken = true;
                    circuitBreakNotice =
                      '\n\n抱歉，当前查询遇到了问题，请稍后重试或换个方式提问。';
                    break;
                  }

                  logger.log(`工具调用 #${toolCallCount}: ${toolCall.name}`);

                  // 检测是否调用了风险相关工具
                  if (
                    toolCall.name === 'risk_list' ||
                    toolCall.name === 'risk_detail'
                  ) {
                    hasRiskToolCall = true;
                  }

                  // 收集工具调用记录
                  if (toolCall.id) {
                    pendingToolCalls.push({
                      id: toolCall.id,
                      name: toolCall.name,
                      args: toolCall.args || {},
                    });
                  }

                  yield {
                    type: 'tool',
                    toolName: toolCall.name,
                    toolInput: toolCall.args,
                  };
                }
              }
            }

            // 如果有文本内容（流式输出每个 token chunk）
            if (aiMessage.content && typeof aiMessage.content === 'string') {
              const rawContent = aiMessage.content;

              if (rawContent) {
                // 输出净化：标识符可能在 chunk 边界被切断，
                // 净化器内部有尾部缓冲，返回空串表示本段还在缓冲中，属正常情况。
                const content = outputSanitizer.push(rawContent);

                if (content) {
                  // 累积最终答案
                  finalAnswer += content;

                  // 流式输出当前 chunk
                  yield {
                    type: 'token',
                    content: content,
                  };
                }
              }
            }
          }

          // 处理工具消息
          if (messageType === 'ToolMessage' || message instanceof ToolMessage) {
            const toolMessage = message as ToolMessage;
            logger.log(`工具结果: ${toolMessage.name}`);
            logger.log(`工具返回内容: ${typeof toolMessage.content === 'string' ? toolMessage.content : JSON.stringify(toolMessage.content)}`);

            // 当收到工具结果时，先保存之前累积的 AI tool_calls 消息
            if (pendingToolCalls.length > 0) {
              collectedMessages.push({
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                toolCalls: [...pendingToolCalls],
              });
              pendingToolCalls.length = 0;
            }

            // 保存工具结果消息（截断过长内容，避免历史上下文过大）
            const toolContent =
              typeof toolMessage.content === 'string'
                ? toolMessage.content
                : JSON.stringify(toolMessage.content);
            const MAX_TOOL_CONTENT_LENGTH = 5000;
            const trimmedContent =
              toolContent.length > MAX_TOOL_CONTENT_LENGTH
                ? toolContent.slice(0, MAX_TOOL_CONTENT_LENGTH) +
                  `\n...[内容已截断，原始长度${toolContent.length}字符]`
                : toolContent;

            collectedMessages.push({
              role: 'tool',
              content: trimmedContent,
              timestamp: new Date(),
              toolCallId: toolMessage.tool_call_id,
              toolName: toolMessage.name,
            });

            yield {
              type: 'toolDone',
            };
          }
        }

        // 输出净化：冲刷尾部缓冲并补全未闭合标签。
        // 必须放在 abort 判断之外 —— 净化器为防字段名被切断，始终扣留最后 holdback 个字符，
        // 若在中止时跳过冲刷，这段已经生成好的内容会被静默丢弃（用户点「停止」时丢尾巴）。
        const sanitizeTail = outputSanitizer.flush();

        // 顺序保证：已生成正文（含缓冲尾巴）在前，熔断提示语在后。
        const tailChunk = sanitizeTail + circuitBreakNotice;
        if (tailChunk) {
          yield {
            type: 'token',
            content: tailChunk,
          };
        }

        const sanitizeReport = outputSanitizer.report();
        if (sanitizeReport) {
          logger.log(`输出净化：${sanitizeReport}`);
        }

        // 只有在未被中止的情况下才更新会话历史
        if (!abortController.signal.aborted) {
          if (tailChunk) {
            finalAnswer += tailChunk;
          }

          // 保存用户消息
          sessionManager.addUserMessage(contextId, query);

          // 保存完整的工具调用链（AI tool_calls + tool results）
          for (const msg of collectedMessages) {
            if (msg.role === 'assistant' && msg.toolCalls) {
              sessionManager.addAssistantMessage(
                contextId,
                msg.content,
                msg.toolCalls,
              );
            } else if (msg.role === 'tool') {
              sessionManager.addToolMessage(
                contextId,
                msg.toolCallId || '',
                msg.toolName || '',
                msg.content,
              );
            }
          }

          // 保存最终的 AI 回答（截断过长内容）
          if (finalAnswer) {
            const MAX_ANSWER_LENGTH = 5000;
            const trimmedAnswer =
              finalAnswer.length > MAX_ANSWER_LENGTH
                ? finalAnswer.slice(0, MAX_ANSWER_LENGTH) +
                  `\n...[回答已截断，原始长度${finalAnswer.length}字符]`
                : finalAnswer;
            sessionManager.addAssistantMessage(contextId, trimmedAnswer);
          }

          // 裁剪历史，保留最近 N 轮
          sessionManager.trimHistory(contextId);

          logger.log(`查询处理成功, 工具调用次数: ${toolCallCount}`);

          // 风险场景钉钉通知
          if (hasRiskToolCall && finalAnswer) {
            try {
              const dingdingContent = `当前场景：风险提醒\n用户消息：${query}\nAI回复：${finalAnswer}`;
              await agentApiService.sendDingding({
                content: dingdingContent,
              });
              logger.log('风险场景钉钉通知发送成功');
            } catch (dingdingError: any) {
              logger.error(
                '风险场景钉钉通知发送失败: ' +
                  (dingdingError?.message || dingdingError),
              );
            }
          }

          // 发送完成信号
          yield {
            type: 'done',
          };
        }
      } catch (error: any) {
        // 如果是因为 abort 导致的错误，静默处理
        if (error?.name === 'AbortError' || abortController.signal.aborted) {
          logger.log('检测到中止操作，静默退出生成器');
          return;
        }

        logger.error('=== 完整错误信息 ===');
        logger.error('错误: ' + error);
        logger.error('错误消息: ' + error?.message);
        logger.error('错误堆栈: ' + error?.stack);
        logger.error('错误原因: ' + error?.cause);
        logger.error('错误名称: ' + error?.name);
        logger.error('==================');

        logger.error('查询处理错误: ' + error);
        logger.error('错误消息: ' + (error?.message || '无消息'));
        logger.error('错误堆栈: ' + (error?.stack || '无堆栈'));
        logger.error('错误原因: ' + (error?.cause || '无原因'));

        yield {
          type: 'error',
          content: `抱歉，处理您的请求时出现错误：${error?.message || error}`,
        };
      }
    };

    // 定义 chunksStop 方法
    const chunksStop = async () => {
      logger.log('调用 chunksStop，中止流处理');
      abortController.abort();
    };

    return {
      chunks: chunksGenerator(),
      chunksStop,
    };
  }

  /**
   * 获取会话统计
   */
  getSessionStats() {
    return this.sessionManager.getStats();
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    this.sessionManager.cleanupExpiredSessions();
  }

  /**
   * 生成报告
   * @param taxNo 企业税号
   * @param userId 用户ID
   */
  async createReport(taxNo: string, userId: string) {
    this.logger.log(`生成报告: taxNo=${taxNo}, userId=${userId}`);
    const result = await this.agentApiService.createReport({
      saasCheckUrl: this.config.saasCheckUrl,
      taxNo,
      userId,
    });
    return result.data;
  }
}
