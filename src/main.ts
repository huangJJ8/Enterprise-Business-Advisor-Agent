import { webcrypto } from 'node:crypto';

// Node 18 没有全局 crypto，部分依赖（如 @langchain）需要它
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import {
  NestExpressApplication,
  ExpressAdapter,
} from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { getConfig, getEnv } from './config';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
// import * as session from 'express-session';

import { AppModule } from './modules/app.module';
import { LoggerService } from './modules-global/logger/service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { bodyParser: false },
  );

  // 改用了 iron-session
  // app.use(
  //   session({
  //     secret: 'bff',
  //     rolling: true,
  //     cookie: { maxAge: 24 * 3600 * 1000 * 2 }, // 2 天
  //   }),
  // );

  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.use(cookieParser());

  // 测试环境启用跨域
  if (getEnv() === 'dev') {
    app.enableCors({
      origin: true, // 允许所有来源
      credentials: true, // 允许携带凭证
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'x-yzm',
        'cache-control',
        'X-Access-Token',
        'X-Refresh-Token',
        'X-Client-Type',
        'X-Device-ID',
      ],
    });
    global.logger?.log('测试环境：已启用跨域配置');
  }

  // 添加全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  // 初始化全局 LoggerService
  global.logger = app.get(LoggerService);

  const configService = app.get(ConfigService);

  const { port } = configService.get('server') as ServerConfig;

  global.logger.log(`端口号: ${port}`);
  global.logger.verbose(`RUNNING_ENV: ${getEnv()}`);

  await app.listen(port);
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  // 如果全局 logger 已初始化则使用它，否则使用 NestJS Logger
  if (global.logger) {
    global.logger.error('未捕获的异常: ' + error.message);
    global.logger.error('堆栈信息: ' + error.stack);
  } else {
    const logger = new Logger('UncaughtException');
    logger.error('未捕获的异常: ' + error.message);
    logger.error('堆栈信息: ' + error.stack);
  }
  // 不要立即退出进程，让应用继续运行
  // process.exit(1);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  // 如果全局 logger 已初始化则使用它，否则使用 NestJS Logger
  if (global.logger) {
    global.logger.error('未处理的Promise拒绝: ' + reason);
    global.logger.error('Promise: ' + JSON.stringify(promise));
  } else {
    const logger = new Logger('UnhandledRejection');
    logger.error('未处理的Promise拒绝: ' + reason);
    logger.error('Promise: ' + JSON.stringify(promise));
  }
  // 不要立即退出进程，让应用继续运行
  // process.exit(1);
});

bootstrap().catch((error) => {
  global.logger.error('应用启动失败: ' + error);
  process.exit(1);
});
