import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppController } from './app.controller';

import { RedisModule } from 'src/modules-global/redis/module';
import { HttpModule } from 'src/modules-global/http/module';
import { LoggerModule } from 'src/modules-global/logger/module';

import { SseModule } from 'src/modules-global/sse/module';
import { AsyncContextModule } from 'src/modules-global/async-context/module';
import { UtilsModule } from 'src/modules-global/utils/module';
import { CacheModule } from 'src/modules-global/cache/module';

import { AIModule } from 'src/modules/ai/module';
import { YzmModule } from 'src/modules/yzm/module';
import { AgentModule } from 'src/modules/agent/agent.module';
import { UploadModule } from 'src/modules/upload/upload.module';

import { FilterMiddleware } from 'src/middleware/filter';
import { IronSessionMiddleware } from 'src/middleware/session';
import { ProxyMiddleware } from 'src/middleware/proxy';
import { AsyncContextMiddleware } from 'src/middleware/async-context';
import {
  JsonBodyParserMiddleware,
  UrlEncodedBodyParserMiddleware,
} from 'src/middleware/body-parser';

import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { getConfig } from 'src/config';

import { APP_INTERCEPTOR } from '@nestjs/core';

import { InvokeRecordInterceptor } from 'src/interceptor/invoke-record';
import { FormatResponseInterceptor } from 'src/interceptor/format-response';
import {
  LoginGuard,
  AuthGuard,
  RateLimitGuard,
  PasswordGuard,
} from 'src/guards';

// 中间件：将 moduleRef 附加到请求对象
function moduleRefMiddleware(moduleRef: ModuleRef) {
  return (req: MyReq, res, next) => {
    req.moduleRef = moduleRef;
    next();
  };
}

@Module({
  imports: [
    RedisModule,
    HttpModule,
    CacheModule,

    AIModule,
    YzmModule,
    AgentModule,
    UploadModule,
    SseModule,
    AsyncContextModule,
    UtilsModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      ignoreEnvFile: false,
      isGlobal: true,
      load: [getConfig],
      // envFilePath: 'src/.env',
    }),
    LoggerModule,
  ],
  controllers: [AppController],
  providers: [
    LoginGuard,
    AuthGuard,
    RateLimitGuard,
    PasswordGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: InvokeRecordInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: FormatResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  constructor(private moduleRef: ModuleRef) {}
  configure(consumer: MiddlewareConsumer) {
    // consumer
    //   .apply(ProxyMiddleware)
    //   .forRoutes({ path: 'api/proxy/*path', method: RequestMethod.ALL });
    // 全局应用中间件，将 moduleRef 注入到请求中

    // 用途是在每个请求中都能获取到 moduleRef，从而可以在控制器中使用依赖注入
    // 例如：const userService: UserService = moduleRef.get(UserService, {
    //   strict: false,
    // });
    consumer
      .apply((req, res, next) =>
        moduleRefMiddleware(this.moduleRef)(req, res, next),
      )
      .exclude({
        path: 'api/proxy/*path',
        method: RequestMethod.ALL,
      })
      .forRoutes('*path');

    // 优先应用 AsyncContextMiddleware，确保在所有其他中间件、守卫、拦截器之前设置上下文
    // 这样装饰器在执行时就能访问到 asyncContext 中的值
    consumer
      .apply(AsyncContextMiddleware)
      .exclude({
        path: 'api/proxy/*path',
        method: RequestMethod.ALL,
      })
      .forRoutes('*path');

    // 全局应用中间件，处理请求体解析、过滤、会话中间件
    consumer
      .apply(
        JsonBodyParserMiddleware,
        UrlEncodedBodyParserMiddleware,
        FilterMiddleware,
        IronSessionMiddleware,
      )
      .exclude({
        path: 'api/proxy/*path',
        method: RequestMethod.ALL,
      })
      .forRoutes('*path');
  }
}
