import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { LoggerService } from 'src/modules-global/logger/service';

export interface HashData {
  [key: string]: Record<string, string>;
}

/**
 * Redis服务类
 * 提供对Redis数据库各种数据类型的操作封装
 */
@Injectable()
export class RedisService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  @Inject('REDIS')
  private redis!: Redis;

  async set(params: { key: string; value: string; ttl?: number }) {
    const { key, value, ttl } = params;

    await this.redis.set(key, value);

    if (ttl) {
      await this.setExpire({ key, ttl });
    }
  }

  async get(params: { key: string }) {
    const { key } = params;
    return await this.redis.get(key);
  }

  /**
   * 获取哈希表所有字段和值
   * @param params 参数对象
   * @param params.key Redis键名
   * @returns 返回包含所有字段和值的对象
   * @example
   * // 获取用户信息
   * const userInfo = await redisService.hashGet({
   *   key: 'user:1001'
   * });
   */
  async hashGet<T>(params: { key: string }): Promise<T> {
    const { key } = params;
    return (await this.redis.hgetall(key)) as T;
  }

  /**
   * 设置哈希表字段和值
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.obj 包含要设置的字段和值的对象
   * @param params.ttl 可选的过期时间(秒)
   * @returns 返回布尔值，表示操作是否成功
   * @example
   * // 缓存用户信息
   * await redisService.hashSet({
   *   key: 'user:1001',
   *   obj: { name: '张三', age: 30, email: 'zhangsan@example.com' },
   *   ttl: 3600
   * });
   */
  async hashSet(params: {
    key: string;
    obj: Record<string, any>;
    ttl?: number;
  }) {
    const { key, obj, ttl } = params;
    for (let name in obj) {
      await this.redis.hset(key, name, obj[name]);
    }

    if (ttl) {
      await this.setExpire({ key, ttl });
    }

    return true;
  }

  async getHashKeysWithPrefix(prefix: string): Promise<HashData> {
    try {
      let cursor = '0';
      let keys: string[] = [];

      // 1. 使用 SCAN 遍历所有匹配前缀的 key
      do {
        const [newCursor, newKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = newCursor;
        keys = keys.concat(newKeys);
      } while (cursor !== '0');

      // 2. 获取所有 Hash 数据
      const results: HashData = {};

      // 使用 Promise.all 并行获取数据，提高性能
      const hashPromises = keys.map(async (key) => {
        try {
          // 检查 key 的类型是否为 hash
          const keyType = await this.redis.type(key);
          if (keyType !== 'hash') {
            return;
          }

          const hashData = await this.redis.hgetall(key);
          if (Object.keys(hashData).length > 0) {
            results[key] = hashData;
          }
        } catch (error: any) {
          this.logger.error(
            `获取键 ${key} 的哈希数据失败: ${error.message}`,
          );
        }
      });

      await Promise.all(hashPromises);

      return results;
    } catch (error: any) {
      this.logger.error(`获取前缀哈希键失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 向列表添加一个或多个值
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.values 要添加的值，可以是单个字符串或字符串数组
   * @param params.direction 添加方向，'left'或'right'，默认为'right'
   * @param params.ttl 可选的过期时间(秒)
   * @returns 操作后列表的长度
   * @example
   * // 添加任务到队列
   * const length = await redisService.listPush({
   *   key: 'tasks:queue',
   *   values: ['task1', 'task2'],
   *   direction: 'right',
   *   ttl: 86400
   * });
   */
  async listPush(params: {
    key: string;
    values: string | string[];
    direction?: 'left' | 'right';
    ttl?: number;
  }) {
    const { key, values, direction = 'right', ttl } = params;

    const list = Array.isArray(values) ? values : [values];

    let result = 0;
    if (direction === 'left') {
      result = await this.redis.lpush(key, ...list);
    } else {
      result = await this.redis.rpush(key, ...list);
    }

    if (ttl) {
      await this.setExpire({ key, ttl });
    }

    return result;
  }

  /**
   * 从列表中弹出一个值
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.direction 弹出方向，'left'或'right'，默认为'right'
   * @returns 弹出的值，如果列表为空则返回null
   * @example
   * // 从队列中获取下一个任务
   * const task = await redisService.listPop({
   *   key: 'tasks:queue',
   *   direction: 'left'
   * });
   */
  async listPop(params: { key: string; direction?: 'left' | 'right' }) {
    const { key, direction = 'right' } = params;

    return direction === 'left'
      ? await this.redis.lpop(key)
      : await this.redis.rpop(key);
  }

  /**
   * 获取列表指定范围内的元素
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.start 开始位置，默认为0
   * @param params.stop 结束位置，默认为-1(列表末尾)
   * @returns 指定范围的元素数组
   * @example
   * // 获取最新的10条消息
   * const messages = await redisService.listRange({
   *   key: 'recent:messages',
   *   start: 0,
   *   stop: 9
   * });
   */
  async listRange(params: { key: string; start?: number; stop?: number }) {
    const { key, start = 0, stop = -1 } = params;
    return await this.redis.lrange(key, start, stop);
  }

  /**
   * 获取列表长度
   * @param params 参数对象
   * @param params.key Redis键名
   * @returns 列表的长度
   * @example
   * // 获取待处理任务数量
   * const count = await redisService.listLength({
   *   key: 'tasks:pending'
   * });
   */
  async listLength(params: { key: string }) {
    const { key } = params;
    return await this.redis.llen(key);
  }

  /**
   * 通过索引获取列表中的元素
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.index 索引值
   * @returns 对应索引的元素
   * @example
   * // 获取列表中的第一个元素
   * const firstItem = await redisService.listGetByIndex({
   *   key: 'recent:users',
   *   index: 0
   * });
   */
  async listGetByIndex(params: { key: string; index: number }) {
    const { key, index } = params;
    return await this.redis.lindex(key, index);
  }

  /**
   * 通过索引设置列表元素的值
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.index 索引值
   * @param params.value 要设置的新值
   * @returns 操作结果，'OK'表示成功
   * @example
   * // 更新列表中的第一个元素
   * await redisService.listSetByIndex({
   *   key: 'top:products',
   *   index: 0,
   *   value: 'product:1001'
   * });
   */
  async listSetByIndex(params: { key: string; index: number; value: string }) {
    const { key, index, value } = params;
    return await this.redis.lset(key, index, value);
  }

  /**
   * 移除列表中的元素
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.count 移除数量
   * @param params.value 要移除的值
   * @returns 被移除元素的数量
   * @example
   * // 从列表中移除所有值为'user:1001'的元素
   * const removed = await redisService.listRemove({
   *   key: 'online:users',
   *   count: 0,
   *   value: 'user:1001'
   * });
   */
  async listRemove(params: { key: string; count: number; value: string }) {
    const { key, count, value } = params;
    return await this.redis.lrem(key, count, value);
  }

  /**
   * 对列表进行修剪，只保留指定范围内的元素
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.start 开始位置
   * @param params.stop 结束位置
   * @returns 操作结果，'OK'表示成功
   * @example
   * // 只保留最新的100条日志
   * await redisService.listTrim({
   *   key: 'system:logs',
   *   start: 0,
   *   stop: 99
   * });
   */
  async listTrim(params: { key: string; start: number; stop: number }) {
    const { key, start, stop } = params;
    return await this.redis.ltrim(key, start, stop);
  }

  /**
   * 阻塞式从列表中弹出元素，适用于消息队列场景
   * @param params 参数对象
   * @param params.key Redis键名或键名数组
   * @param params.timeout 超时时间(秒)
   * @param params.direction 弹出方向，'left'或'right'，默认为'right'
   * @returns 返回一个数组 [键名, 弹出的值]，如果超时则返回null
   * @example
   * // 从多个队列中获取下一个任务，最多等待5秒
   * const result = await redisService.listBlockingPop({
   *   key: ['high:tasks', 'normal:tasks', 'low:tasks'],
   *   timeout: 5,
   *   direction: 'left'
   * });
   */
  async listBlockingPop(params: {
    key: string | string[];
    timeout: number;
    direction?: 'left' | 'right';
  }) {
    const { key, timeout, direction = 'right' } = params;
    const keys = Array.isArray(key) ? key : [key];

    return direction === 'left'
      ? await this.redis.blpop(keys, timeout)
      : await this.redis.brpop(keys, timeout);
  }

  /**
   * 设置列表的过期时间
   * @param params 参数对象
   * @param params.key Redis键名
   * @param params.ttl 过期时间(秒)
   * @returns 操作结果(1成功，0键不存在)
   * @example
   * // 设置列表1小时后过期
   * await redisService.setExpire({
   *   key: 'temporary:list',
   *   ttl: 3600
   * });
   */
  async setExpire(params: { key: string; ttl: number }) {
    const { key, ttl } = params;
    return await this.redis.expire(key, ttl);
  }

  /**
   * 检查键是否存在
   * @param params 参数对象
   * @param params.key Redis键名
   * @returns 布尔值，true表示键存在，false表示键不存在
   * @example
   * // 检查队列是否存在
   * const exists = await redisService.keyExists({
   *   key: 'tasks:queue'
   * });
   * if (exists) {
   *   // 队列存在，继续处理
   * }
   */
  async keyExists(params: { key: string }) {
    const { key } = params;
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * 删除一个或多个键
   * @param params 参数对象
   * @param params.keys 要删除的键名或键名数组
   * @returns 返回被删除键的数量
   * @example
   * // 删除单个键
   * const result1 = await redisService.deleteKeys({
   *   keys: 'user:1001'
   * });
   *
   * // 删除多个键
   * const result2 = await redisService.deleteKeys({
   *   keys: ['user:1001', 'session:1001', 'cart:1001']
   * });
   */
  async deleteKeys(params: { keys: string | string[] }) {
    const { keys } = params;

    const keysArray = Array.isArray(keys) ? keys : [keys];

    return await this.redis.del(...keysArray);
  }

  /**
   * 获取匹配模式的所有键（使用 SCAN 命令，生产环境安全）
   * @param params 参数对象
   * @param params.pattern 匹配模式，如 'session:*'
   * @returns 返回匹配的键名数组
   * @example
   * // 获取所有 session 键
   * const sessionKeys = await redisService.scanKeys({
   *   pattern: 'session:*'
   * });
   */
  async scanKeys(params: { pattern: string }): Promise<string[]> {
    const { pattern } = params;

    try {
      let cursor = '0';
      let keys: string[] = [];

      // 使用 SCAN 遍历所有匹配的 key
      do {
        const [newCursor, newKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100, // 每次扫描100个key
        );
        cursor = newCursor;
        keys = keys.concat(newKeys);
      } while (cursor !== '0');

      return keys;
    } catch (error: any) {
      this.logger.error(`扫描键失败: ${error.message}`);
      throw error;
    }
  }
}
