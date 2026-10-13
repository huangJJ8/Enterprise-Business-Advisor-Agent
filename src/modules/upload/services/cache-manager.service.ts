import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadConfig } from '../config/upload.config';

/**
 * 带文件名的数据内容项
 */
export interface DataContentItem {
  fileName: string; // 数据来源文件名
  content: string; // 提取的文本内容
}

/**
 * 缓存数据结构
 * 存储模板和数据文件的结构化内容
 */
export interface ReportCacheData {
  templateContent: string; // 模板结构化内容
  dataContents: DataContentItem[]; // 数据文件结构化内容列表（带文件名）
  companyName?: string; // 企业名称
  taxNo?: string; // 统一社会信用代码
  createdAt: number; // 创建时间戳
  used: boolean; // 是否已被消费
}

interface CacheEntry {
  data: ReportCacheData;
  ttl: number; // 过期时间（毫秒）
}

/**
 * CacheManager 缓存管理服务
 * 使用内存 Map 存储 Temp_ID 关联的报告数据
 * 支持 TTL 过期和定时清理
 */
@Injectable()
export class CacheManager implements OnModuleInit {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtl: number;

  constructor(private readonly uploadConfig: UploadConfig) {
    this.defaultTtl = this.uploadConfig.cacheExpireTime;
  }

  onModuleInit() {
    this.logger.log(`CacheManager 已初始化, 默认 TTL: ${this.defaultTtl}ms`);
  }

  /**
   * 存储 tempId 关联数据
   * @param tempId 临时唯一标识符
   * @param data 报告缓存数据
   * @param ttl 过期时间（毫秒），默认使用配置中的 cacheExpireTime
   */
  set(tempId: string, data: ReportCacheData, ttl?: number): void {
    const entry: CacheEntry = {
      data: { ...data },
      ttl: ttl ?? this.defaultTtl,
    };
    this.cache.set(tempId, entry);
    this.logger.log(`缓存已设置: ${tempId}, TTL: ${entry.ttl}ms`);
  }

  /**
   * 获取缓存数据
   * @param tempId 临时唯一标识符
   * @returns 缓存数据，不存在或已过期返回 null
   */
  get(tempId: string): ReportCacheData | null {
    const entry = this.cache.get(tempId);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.data.createdAt > entry.ttl) {
      this.cache.delete(tempId);
      this.logger.log(`缓存已过期并移除: ${tempId}`);
      return null;
    }

    return entry.data;
  }

  /**
   * 标记为已使用
   * 数据保留至 TTL 到期后清理
   * @param tempId 临时唯一标识符
   */
  markUsed(tempId: string): void {
    const entry = this.cache.get(tempId);
    if (entry) {
      entry.data.used = true;
      this.logger.log(`缓存已标记为已使用: ${tempId}`);
    }
  }

  /**
   * 清理过期数据
   * 每 5 分钟自动执行
   */
  @Interval(5 * 60 * 1000)
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [tempId, entry] of this.cache.entries()) {
      if (now - entry.data.createdAt > entry.ttl) {
        this.cache.delete(tempId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`缓存清理: 已移除 ${cleanedCount} 个过期条目, 剩余: ${this.cache.size}`);
    }
  }
}
