import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadConfig } from '../config/upload.config';

/**
 * 报告任务状态
 */
export type ReportTaskStatus = 'processing' | 'success' | 'failed';

/**
 * 报告任务数据
 */
export interface ReportTaskData {
  status: ReportTaskStatus;
  result?: string;   // 成功时的 docx 文件路径
  htmlContent?: string; // 成功时的 HTML 预览内容
  error?: string;    // 失败时的错误信息
  createdAt: number;
}

interface TaskEntry {
  data: ReportTaskData;
  ttl: number;
}

/**
 * ReportTaskManager
 * 管理自定义报告异步任务的状态（内存存储，后期迁移数据库）
 */
@Injectable()
export class ReportTaskManager implements OnModuleInit {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;
  private readonly tasks = new Map<string, TaskEntry>();
  private readonly defaultTtl: number;

  constructor(private readonly uploadConfig: UploadConfig) {
    this.defaultTtl = this.uploadConfig.cacheExpireTime;
  }

  onModuleInit() {
    this.logger.log(`ReportTaskManager 已初始化, 默认 TTL: ${this.defaultTtl}ms`);
  }

  /**
   * 创建任务（初始状态为 processing）
   */
  create(tempId: string): void {
    this.tasks.set(tempId, {
      data: { status: 'processing', createdAt: Date.now() },
      ttl: this.defaultTtl,
    });
    this.logger.log(`报告任务已创建: ${tempId}`);
  }

  /**
   * 标记任务成功
   */
  setSuccess(tempId: string, result: string, htmlContent?: string): void {
    const entry = this.tasks.get(tempId);
    if (entry) {
      entry.data.status = 'success';
      entry.data.result = result;
      entry.data.htmlContent = htmlContent;
      this.logger.log(`报告任务成功: ${tempId}`);
    }
  }

  /**
   * 标记任务失败
   */
  setFailed(tempId: string, error: string): void {
    const entry = this.tasks.get(tempId);
    if (entry) {
      entry.data.status = 'failed';
      entry.data.error = error;
      this.logger.error(`报告任务失败: ${tempId}, 原因: ${error}`);
    }
  }

  /**
   * 查询任务状态
   */
  get(tempId: string): ReportTaskData | null {
    const entry = this.tasks.get(tempId);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.data.createdAt > entry.ttl) {
      this.tasks.delete(tempId);
      return null;
    }
    return entry.data;
  }

  /**
   * 定时清理过期任务，每 5 分钟执行
   */
  @Interval(5 * 60 * 1000)
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, entry] of this.tasks.entries()) {
      if (now - entry.data.createdAt > entry.ttl) {
        this.tasks.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`报告任务清理: 移除 ${cleaned} 个过期条目, 剩余: ${this.tasks.size}`);
    }
  }
}
