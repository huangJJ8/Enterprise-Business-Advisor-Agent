import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as requestIp from 'request-ip';

import { RedisService } from 'src/modules-global/redis/service';
import { LoggerService } from 'src/modules-global/logger/service';

/**
 * 频率限制守卫
 * 限制同一IP地址在指定时间内的接口调用次数
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redisService: RedisService,
    @Inject(LoggerService) private logger: LoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MyReq>();

    // 获取装饰器设置的限制参数
    const rateLimit =
      this.reflector.getAllAndOverride<RateLimitDecoratorPayload>('rateLimit', [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!rateLimit) {
      return true;
    }

    const {
      count,
      second,
      key = (request.route?.path || request.url) as string,
    } = rateLimit;

    // 获取客户端IP地址
    const clientIp = requestIp.getClientIp(request);

    if (!clientIp) {
      throw new BadRequestException('无法获取客户端IP地址');
    }

    // 构造Redis键名
    const rateLimitKey = `rate_limit:${clientIp}:${key}`;

    try {
      const now = Date.now();
      const timeWindow = second * 1000; // 转换为毫秒

      // 获取存储的时间戳列表
      const timestampsStr = await this.redisService.get({ key: rateLimitKey });
      let timestamps: number[] = [];

      if (timestampsStr) {
        // 解析时间戳字符串为数组
        timestamps = timestampsStr
          .split(',')
          .map((ts) => parseInt(ts, 10))
          .filter((ts) => !isNaN(ts));
      }

      this.logger.log('原始时间戳列表 ' + JSON.stringify(timestamps));

      // 使用二分查找优化性能，找到第一个有效时间戳的位置
      let validTimestamps: number[] = [];

      if (timestamps.length !== 0) {
        const cutoffTime = now - timeWindow;
        let left = 0;
        let right = timestamps.length - 1;

        // 二分查找第一个 >= cutoffTime 的时间戳位置
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          if (timestamps[mid] >= cutoffTime) {
            right = mid - 1;
          } else {
            // 所以，left左边的都是比目标值小的值，所以left就是第一个>=目标值的位置
            left = mid + 1;
          }
        }

        // 截取有效的时间戳数组
        validTimestamps = timestamps.slice(left);
      }

      this.logger.log('有效时间戳列表 ' + JSON.stringify(validTimestamps));
      this.logger.log('当前有效调用次数 ' + validTimestamps.length);

      // 检查是否超过限制
      if (validTimestamps.length >= count) {
        throw new HttpException('调用超限！', HttpStatus.TOO_MANY_REQUESTS);
      }

      // 添加当前时间戳
      validTimestamps.push(now);

      // 将更新后的时间戳列表存储回Redis
      const newTimestampsStr = validTimestamps.join(',');
      await this.redisService.set({
        key: rateLimitKey,
        value: newTimestampsStr,
        ttl: second, // 设置过期时间，防止Redis中积累过多无用数据
      });

      this.logger.log('更新后的时间戳列表 ' + newTimestampsStr);

      return true;
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        throw error;
      }
      // Redis操作失败时，允许请求通过（降级处理）
      this.logger.error('Redis操作失败，允许请求通过 ' + error);
      return true;
    }
  }
}
