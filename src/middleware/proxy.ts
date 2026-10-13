import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import type { RequestHandler } from 'express';
import { formatBody } from 'src/utils/handleHttp';

import { LoggerService } from 'src/modules-global/logger/service';

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private proxyMiddleware!: RequestHandler;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.initializeProxy();
  }

  private initializeProxy() {
    // 从配置文件获取代理配置
    const proxyConfig = this.configService.get('proxy') as ProxyConfig;
    this.logger.log('代理配置: ' + JSON.stringify(proxyConfig));
    const { target, timeout, retries, pathRewrite } = proxyConfig;

    const proxyOptions: Options = {
      target,
      changeOrigin: true,
      timeout, // 增加超时时间到60秒
      proxyTimeout: 60000,
      //   secure: true, // 验证SSL证书
      followRedirects: true,
      pathRewrite,
      // 使用 on 对象配置事件监听器
      on: {
        // 请求处理
        proxyReq: async (proxyReq, req, res) => {
          this.logger.log('onProxyReq 回调被执行!');

          // 添加转发头信息
          const clientIP =
            req.socket?.remoteAddress ||
            (req.headers['x-forwarded-for'] as string) ||
            'unknown';
          proxyReq.setHeader('X-Forwarded-For', clientIP);
          proxyReq.setHeader(
            'X-Forwarded-Proto',
            req.headers['x-forwarded-proto'] || 'http',
          );
          proxyReq.setHeader('X-Forwarded-Host', req.headers.host || 'unknown');
          proxyReq.setHeader('X-Real-IP', clientIP);

          // 移除敏感头信息
          proxyReq.removeHeader('cookie');
          proxyReq.removeHeader('authorization');

          // 处理POST请求体 - 直接从原始请求流中读取

          formatBody(req)
            .then((body) => {
              const { bodyStr } = body;
              // 记录请求日志
              this.logger.log(
                `代理请求 ${req.method} ${req.url} 到 ${target}; body: ${bodyStr};`,
              );
            })
            .catch((err) => {
              this.logger.error(
                `代理请求 ${req.method} ${req.url} 到 ${target} 失败; body: ${err.message};`,
              );
            });
        },
        // 响应处理
        proxyRes: (proxyRes, req, res) => {
          // 添加自定义响应头
          proxyRes.headers['X-Proxy-By'] = 'NestJS-MiddleProxy';
          proxyRes.headers['X-Proxy-Timestamp'] = new Date().toISOString();

          // 移除敏感响应头
          delete proxyRes.headers['set-cookie'];
          delete proxyRes.headers['server'];

          formatBody(proxyRes)
            .then((body) => {
              const { bodyStr } = body;
              // 记录请求日志
              this.logger.log(
                `代理响应  ${proxyRes.statusCode} ${req.method} ${req.url} body: ${bodyStr};`,
              );
            })
            .catch((err) => {
              this.logger.error(
                `代理响应 ${proxyRes.statusCode} ${req.method} ${req.url} 失败; body: ${err.message};`,
              );
            });
        },
        // 错误处理
        error: (err, req, res) => {
          this.logger.error(
            `代理错误 ${req.method} ${req.url}: ${err.message}`,
            err.stack,
          );
          this.logger.error('代理错误详情:' + JSON.stringify(err));

          // 检查是否为 ServerResponse 类型
          if ('headersSent' in res && !res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: '网关错误',
                message: `代理服务器错误: ${err.message}`,
                timestamp: new Date().toISOString(),
                path: req.url,
              }),
            );
          }
        },
        // WebSocket 代理错误处理
        proxyReqWs: (proxyReq, req, socket) => {
          socket.on('error', (err) => {
            this.logger.error(`WebSocket 代理错误: ${err.message}`);
          });
        },
      },
      // 健康检查
      router: (req) => {
        // 可以根据请求动态选择目标服务器
        return target;
      },
    };

    this.proxyMiddleware = createProxyMiddleware(proxyOptions);
  }

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(`ProxyMiddleware被调用: ${req.method} ${req.url}`);

    try {
      // 请求验证
      if (!this.isValidRequest(req)) {
        return res.status(400).json({
          error: '请求错误',
          message: '无效的代理请求',
          timestamp: new Date().toISOString(),
        });
      }

      // 速率限制检查（可以集成 Redis 实现分布式限流）
      if (!this.checkRateLimit(req)) {
        return res.status(429).json({
          error: '请求过多',
          message: '超过速率限制',
          timestamp: new Date().toISOString(),
        });
      }

      // 执行代理
      this.proxyMiddleware(req, res, next);
      this.logger.log('代理中间件执行完成');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`中间件错误: ${errorMessage}`, errorStack);
      if (!res.headersSent) {
        res.status(500).json({
          error: '内部服务器错误',
          message: '代理中间件错误',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private isValidRequest(req: Request): boolean {
    // 基本请求验证
    if (!req.url || req.url.length > 2048) {
      return false;
    }

    // 检查是否包含恶意路径
    const maliciousPatterns = ['../', '.\\', '<script', 'javascript:', 'data:'];
    const url = req.url.toLowerCase();

    return !maliciousPatterns.some((pattern) => url.includes(pattern));
  }

  private checkRateLimit(req: Request): boolean {
    // 简单的内存限流实现（生产环境建议使用 Redis）
    // 这里可以集成更复杂的限流逻辑
    return true;
  }
}
