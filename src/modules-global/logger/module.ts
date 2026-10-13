import { Global, Module, Logger } from '@nestjs/common';

import * as winston from 'winston';
import { WinstonModule } from 'nest-winston';

import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/modules-global/logger/service';
import { color } from 'src/utils/color';

import 'winston-daily-rotate-file';

// 修改 strip-ansi 的导入方式以兼容 6.0.1 版本
// 否则部署的时候报错
const stripAnsi = require('strip-ansi');

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('WinstonConfig');
        const winstonConfig = configService.get('winston') as WinstonConfig;
        logger.debug(`${JSON.stringify(winstonConfig)}`);

        const { level, dirname, filename, datePattern, maxSize, maxFiles } =
          winstonConfig;

        const format = winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), // 自定义时间戳),
          winston.format.printf(
            ({ level, message, timestamp, ...metadata }) => {
              // 去除颜色代码
              const cleanMessage =
                typeof message === 'string' ? stripAnsi(message) : message;
              // 自定义日志格式
              return `${timestamp} [${level}]: ${cleanMessage}`;
            },
          ),
        );

        return {
          level: 'debug',
          transports: [
            new winston.transports.Console({
              format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                // utilities.format.nestLike(),
                winston.format.printf(
                  ({ level, message, timestamp, ...metadata }) => {
                    // 自定义日志格式
                    // 根据日志级别设置不同的颜色
                    let coloredLevel;
                    switch (level) {
                      case 'error':
                        coloredLevel = color.red(`[${level}]`);
                        break;
                      case 'warn':
                        coloredLevel = color.yellow(`[${level}]`);
                        break;
                      case 'info':
                      case 'log':
                        coloredLevel = color.green(`[${level}]`);
                        break;
                      case 'verbose':
                        coloredLevel = color.cyan(`[${level}]`);
                        break;
                      case 'debug':
                        coloredLevel = color.magenta(`[${level}]`);
                        break;
                      default:
                        coloredLevel = color.gray(`[${level}]`);
                    }
                    return `${color.green(timestamp)} ${coloredLevel}: ${level === 'error' ? color.red(message) : message}`;
                  },
                ),
              ),
            }),
            new winston.transports.DailyRotateFile({
              level,
              dirname,
              filename,
              datePattern,
              maxSize,
              maxFiles, // 最多保存多少天
              zippedArchive: true, // 压缩
              format,
            }),
            new winston.transports.DailyRotateFile({
              level: 'error',
              dirname,
              filename: `error-${filename}`,
              datePattern,
              maxSize,
              maxFiles,
              zippedArchive: true,
              format,
            }),
          ],
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
