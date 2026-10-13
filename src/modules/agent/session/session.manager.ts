import { Injectable } from '@nestjs/common';
import { LoggerService } from 'src/modules-global/logger/service';
import { UserContext } from '../graph/state';

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
}

/**
 * 工具结果记录
 */
export interface ToolResultRecord {
  toolCallId: string;
  toolName: string;
  content: string;
}

/**
 * 对话消息 - 支持完整的工具调用链
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  /** assistant 消息中的工具调用 */
  toolCalls?: ToolCallRecord[];
  /** tool 消息的关联信息 */
  toolCallId?: string;
  toolName?: string;
}

/**
 * 会话数据
 */
export interface SessionData {
  id: string;
  userContext: UserContext;
  conversationHistory: ConversationMessage[];
  createdAt: Date;
  lastAccessedAt: Date;
}

/**
 * 会话管理器
 * 负责维护对话上下文和状态
 * 使用 contextId 作为会话数据的键值，支持同一用户的多会话管理
 */
@Injectable()
export class SessionManager {
  private sessions: Map<string, SessionData>;
  private logger: LoggerService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  // 保留最近3轮对话，每轮可能包含多条消息（user + AI tool_calls + tool results + AI final）
  private MAX_ROUNDS: number = 3;

  constructor(logger: LoggerService) {
    this.sessions = new Map();
    this.logger = logger;
    this.startCleanupTask();
  }

  /**
   * 创建新会话
   */
  createSession(contextId: string, userContext: UserContext): void {
    this.sessions.set(contextId, {
      id: contextId,
      userContext,
      conversationHistory: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });
    this.logger.log(`Session created: ${contextId}`);
  }

  /**
   * 获取会话
   */
  getSession(contextId: string): SessionData | undefined {
    const session = this.sessions.get(contextId);
    if (session) {
      session.lastAccessedAt = new Date();
    }
    return session;
  }

  /**
   * 更新会话
   */
  updateSession(contextId: string, updates: Partial<SessionData>): void {
    const session = this.sessions.get(contextId);
    if (session) {
      Object.assign(session, updates);
      session.lastAccessedAt = new Date();
      this.logger.log(`Session updated: ${contextId}`);
    }
  }

  /**
   * 添加用户消息
   */
  addUserMessage(contextId: string, content: string): void {
    const session = this.sessions.get(contextId);
    if (session) {
      session.conversationHistory.push({
        role: 'user',
        content,
        timestamp: new Date(),
      });
      session.lastAccessedAt = new Date();
    }
  }

  /**
   * 添加 AI 消息（带工具调用）
   */
  addAssistantMessage(
    contextId: string,
    content: string,
    toolCalls?: ToolCallRecord[],
  ): void {
    const session = this.sessions.get(contextId);
    if (session) {
      session.conversationHistory.push({
        role: 'assistant',
        content,
        timestamp: new Date(),
        toolCalls,
      });
      session.lastAccessedAt = new Date();
    }
  }

  /**
   * 添加工具结果消息
   */
  addToolMessage(
    contextId: string,
    toolCallId: string,
    toolName: string,
    content: string,
  ): void {
    const session = this.sessions.get(contextId);
    if (session) {
      session.conversationHistory.push({
        role: 'tool',
        content,
        timestamp: new Date(),
        toolCallId,
        toolName,
      });
      session.lastAccessedAt = new Date();
    }
  }

  /**
   * 保留最近 N 轮对话
   * 一轮 = 从一个 user 消息开始，到下一个 user 消息之前的所有消息
   */
  trimHistory(contextId: string): void {
    const session = this.sessions.get(contextId);
    if (!session) return;

    const history = session.conversationHistory;

    // 找到所有 user 消息的索引
    const userIndices: number[] = [];
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === 'user') {
        userIndices.push(i);
      }
    }

    // 如果轮数超过限制，从最近 N 轮的第一个 user 消息开始截取
    if (userIndices.length > this.MAX_ROUNDS) {
      const startIdx = userIndices[userIndices.length - this.MAX_ROUNDS];
      session.conversationHistory = history.slice(startIdx);
    }
  }

  /**
   * 兼容旧接口 - 添加消息到会话历史
   * @deprecated 请使用 addUserMessage / addAssistantMessage / addToolMessage
   */
  addToHistory(
    contextId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    if (role === 'user') {
      this.addUserMessage(contextId, content);
    } else {
      this.addAssistantMessage(contextId, content);
    }
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [contextId, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt.getTime() > maxAgeMs) {
        this.sessions.delete(contextId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 10 * 60 * 1000);
  }

  /**
   * 停止清理任务
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 获取会话统计信息
   */
  getStats(): { totalSessions: number; activeSessions: number } {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    let activeSessions = 0;
    for (const session of this.sessions.values()) {
      if (session.lastAccessedAt.getTime() > fiveMinutesAgo) {
        activeSessions++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
    };
  }
}
