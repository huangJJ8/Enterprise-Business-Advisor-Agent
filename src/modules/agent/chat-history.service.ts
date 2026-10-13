import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from 'src/modules-global/logger/service';

/**
 * 内存中的会话记录
 */
interface ChatHistoryRecord {
  id: number;
  userId: number;
  contextId: string;
  name: string;
  agentType: number;
  state: number;
  createdTime: Date;
  updatedTime: Date;
}

/**
 * 内存中的消息记录
 */
interface ChatMessageRecord {
  id: number;
  historyId: number;
  role: string;
  content: string;
  state: number;
  tokenCount: number | null;
  metadata: object | null;
  createdTime: Date;
}

export interface ChatMessageItem {
  role: string;
  content: string;
  createdTime: string;
}

export interface ChatHistoryItem {
  historyId: number;
  contextId: string;
  name: string;
  updatedTime: string;
}

/**
 * 聊天历史服务（内存存储版本）
 * 当前使用内存 Map 存储，未来迁移数据库时只需替换存储层
 */
@Injectable()
export class ChatHistoryService {
  /** 会话记录：key = id */
  private histories: Map<number, ChatHistoryRecord> = new Map();
  /** 消息记录：key = id */
  private messages: Map<number, ChatMessageRecord> = new Map();
  /** contextId → historyId 索引 */
  private contextIndex: Map<string, number> = new Map();
  /** 自增 ID */
  private historyIdSeq = 0;
  private messageIdSeq = 0;

  constructor(private readonly logger: LoggerService) {}

  /**
   * 生成 contextId，格式为 userId-uuid
   */
  generateContextId(userId: number): string {
    return `${userId}-${uuidv4()}`;
  }

  /**
   * 创建新对话（含空白会话幂等检查）
   * 同一用户只允许存在一个无消息的空白会话
   */
  async createChat(userId: number): Promise<{ contextId: string; historyId: number }> {
    // 查找该用户是否已有空白会话（无消息记录）
    for (const history of this.histories.values()) {
      if (history.userId === userId) {
        const hasMessages = this.getMessagesByHistoryId(history.id).length > 0;
        if (!hasMessages) {
          this.logger.log(`用户 ${userId} 已存在空白会话，复用 contextId: ${history.contextId}`);
          return { contextId: history.contextId, historyId: history.id };
        }
      }
    }

    // 不存在空白记录，创建新会话
    const contextId = this.generateContextId(userId);
    const id = ++this.historyIdSeq;
    const now = new Date();

    const record: ChatHistoryRecord = {
      id,
      userId,
      contextId,
      name: '新会话',
      agentType: 0,
      state: 0,
      createdTime: now,
      updatedTime: now,
    };

    this.histories.set(id, record);
    this.contextIndex.set(contextId, id);

    this.logger.log(`用户 ${userId} 创建新会话，contextId: ${contextId}, historyId: ${id}`);
    return { contextId, historyId: id };
  }

  /**
   * 校验 contextId 是否有效
   */
  async validateContext(contextId: string): Promise<{ valid: boolean; historyId?: number }> {
    const historyId = this.contextIndex.get(contextId);
    if (historyId !== undefined && this.histories.has(historyId)) {
      return { valid: true, historyId };
    }
    return { valid: false };
  }

  /**
   * 保存用户消息
   */
  async saveUserMessage(historyId: number, content: string): Promise<void> {
    const isFirstMessage = this.getMessagesByHistoryId(historyId).length === 0;

    this.addMessage(historyId, 'user', content);
    this.logger.log(`用户消息已保存，historyId: ${historyId}`);

    if (isFirstMessage) {
      await this.updateChatName(historyId, content);
    }
  }

  /**
   * 保存助手消息
   */
  async saveAssistantMessage(
    historyId: number,
    content: string,
    tokenCount?: number,
    metadata?: object,
  ): Promise<void> {
    this.addMessage(historyId, 'assistant', content, tokenCount, metadata);
    this.logger.log(`助手消息已保存，historyId: ${historyId}`);
  }

  /**
   * 更新会话名称（取前 20 个字符）
   */
  async updateChatName(historyId: number, firstMessage: string): Promise<void> {
    const history = this.histories.get(historyId);
    if (history) {
      history.name = firstMessage.substring(0, 20);
      history.updatedTime = new Date();
      this.logger.log(`会话名称已更新，historyId: ${historyId}, name: ${history.name}`);
    }
  }

  /**
   * 获取某会话的所有消息
   */
  async getMessages(contextId: string): Promise<ChatMessageItem[]> {
    const historyId = this.contextIndex.get(contextId);
    if (historyId === undefined) {
      this.logger.log(`未找到 contextId 对应的会话记录，contextId: ${contextId}`);
      return [];
    }

    return this.getMessagesByHistoryId(historyId)
      .sort((a, b) => a.createdTime.getTime() - b.createdTime.getTime())
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
        createdTime: msg.createdTime.toISOString(),
      }));
  }

  /**
   * 获取历史会话列表（过滤空白会话，按 updatedTime 降序）
   */
  async getChatList(userId: number): Promise<ChatHistoryItem[]> {
    const result: ChatHistoryItem[] = [];

    for (const history of this.histories.values()) {
      if (history.userId === userId) {
        const hasMessages = this.getMessagesByHistoryId(history.id).length > 0;
        if (hasMessages) {
          result.push({
            historyId: history.id,
            contextId: history.contextId,
            name: history.name,
            updatedTime: history.updatedTime.toISOString(),
          });
        }
      }
    }

    // 按 updatedTime 降序
    result.sort((a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime());

    this.logger.log(`获取用户 ${userId} 的会话列表，共 ${result.length} 条记录`);
    return result;
  }

  // ---- 内部辅助方法 ----

  private addMessage(
    historyId: number,
    role: string,
    content: string,
    tokenCount?: number,
    metadata?: object,
  ): void {
    const id = ++this.messageIdSeq;
    const record: ChatMessageRecord = {
      id,
      historyId,
      role,
      content,
      state: 0,
      tokenCount: tokenCount ?? null,
      metadata: metadata ?? null,
      createdTime: new Date(),
    };
    this.messages.set(id, record);

    // 更新会话的 updatedTime
    const history = this.histories.get(historyId);
    if (history) {
      history.updatedTime = new Date();
    }
  }

  private getMessagesByHistoryId(historyId: number): ChatMessageRecord[] {
    const result: ChatMessageRecord[] = [];
    for (const msg of this.messages.values()) {
      if (msg.historyId === historyId) {
        result.push(msg);
      }
    }
    return result;
  }
}
