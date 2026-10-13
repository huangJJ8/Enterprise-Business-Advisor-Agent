import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from 'src/modules-global/redis/service';
import { YzmTypeEnum } from 'src/types/types';

@Injectable()
export class YzmService {
  @Inject(RedisService)
  private redisService!: RedisService;

  // 获取 App 端验证码的 Redis key
  // 使用 deviceId 作为唯一标识
  getAppYzmKey(deviceId: string, type: YzmTypeEnum) {
    return `notes:yzm:app:${deviceId}:${type}`;
  }

  // 存储 App 端验证码到 Redis
  async setAppYzm(deviceId: string, type: YzmTypeEnum, code: string) {
    const key = this.getAppYzmKey(deviceId, type);
    // 验证码5分钟过期
    await this.redisService.set({ key, value: code, ttl: 5 * 60 });
  }

  // 获取 App 端验证码
  async getAppYzm(deviceId: string, type: YzmTypeEnum) {
    const key = this.getAppYzmKey(deviceId, type);
    return await this.redisService.get({ key });
  }

  // 删除 App 端验证码（校验成功后调用）
  async deleteAppYzm(deviceId: string, type: YzmTypeEnum) {
    const key = this.getAppYzmKey(deviceId, type);
    await this.redisService.deleteKeys({ keys: key });
  }
}
