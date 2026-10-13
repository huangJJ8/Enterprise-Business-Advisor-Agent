import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/modules-global/logger/service';

import { RedisService } from './service';

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: 'REDIS',
      async useFactory(configService: ConfigService, logger: LoggerService) {
        const config = configService.get('redis') as RedisConfig;

        logger.debug(`${JSON.stringify(config)}`);

        // 过滤掉 undefined 的 username，避免 Redis 5 及以下版本认证失败
        const redisConfig: any = { ...config };
        if (!redisConfig.username) {
          delete redisConfig.username;
        }

        const redis = new Redis(redisConfig);

        return redis;
      },
      inject: [ConfigService, LoggerService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
