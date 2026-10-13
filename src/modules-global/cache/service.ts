/**
 * 通用内存缓存服务
 * 支持泛型数据存储、TTL 自动过期、定时清理
 * 作为全局模块，任何模块均可直接注入使用
 */
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { LoggerService } from 'src/modules-global/logger/service';

interface CacheEntry<T = unknown> {
  data: T;
  createdAt: number;
  ttl: number;
}

/** 默认 TTL：1 小时 */
const DEFAULT_TTL = 60 * 60 * 1000;

@Injectable()
export class CacheService implements OnModuleInit {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  private readonly store = new Map<string, CacheEntry>();

  onModuleInit() {
    this.logger.log('CacheService（通用缓存）已初始化');
  }

  /**
   * 存储数据
   * @param key 缓存键
   * @param data 任意类型数据
   * @param ttl 过期时间（毫秒），默认 1 小时
   */
  set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    this.store.set(key, { data, createdAt: Date.now(), ttl });
    this.logger.log(`[Cache] set: ${key}, TTL: ${ttl}ms`);
  }

  /**
   * 获取数据，过期则自动删除并返回 null
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > entry.ttl) {
      this.store.delete(key);
      this.logger.log(`[Cache] expired: ${key}`);
      return null;
    }

    return entry.data as T;
  }

  /**
   * 判断 key 是否存在且未过期
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * 删除指定 key
   */
  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.logger.log(`[Cache] delete: ${key}`);
    }
    return deleted;
  }

  /**
   * 定时清理过期条目，每 5 分钟执行
   */
  @Interval(5 * 60 * 1000)
  cleanup(): void {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.createdAt > entry.ttl) {
        this.store.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.log(`[Cache] cleanup: 移除 ${count} 个过期条目, 剩余: ${this.store.size}`);
    }
  }
}
