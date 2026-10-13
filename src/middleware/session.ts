import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { NextFunction } from 'express';
import { getIronSession } from 'iron-session';
import { sessionOptions } from 'src/config/session';
import { normalizeDataTypes, isAppClient, getAccessToken } from 'src/utils';
import { LoggerService } from 'src/modules-global/logger/service';

// 反向转换：将字符串转回 BigInt（仅针对特定字段）
function denormalizeUserData(user: any): any {
  if (!user) return user;

  const result = { ...user };
  // 只对已知的BigInt字段进行转换
  if (typeof result.limitbytes === 'string') {
    result.limitbytes = BigInt(result.limitbytes);
  }
  if (typeof result.usedbytes === 'string') {
    result.usedbytes = BigInt(result.usedbytes);
  }
  return result;
}

const decryptAccessToken  = (v) => v

@Injectable()
export class IronSessionMiddleware implements NestMiddleware {
  @Inject(LoggerService)
  private logger!: LoggerService;

  async use(req: MyReq, res: MyRes, next: NextFunction) {
    try {
      // 判断是否为 APP 客户端请求
      req.isAppClient = isAppClient(req);

      // APP 客户端请求：不处理 Cookie/Session，而是解析 X-Access-Token
      if (req.isAppClient) {
        const accessToken = getAccessToken(req);
        if (accessToken) {
          // 解密 Token 获取 sessionId
          const sessionId = decryptAccessToken(accessToken);
          if (sessionId) {
            req.appSessionId = sessionId;
          }
        }
        // APP 请求不需要 session，创建一个空的 session 对象以保持类型兼容
        req.session = {
          user: req.appSessionId ? { sessionId: req.appSessionId } : undefined,
        } as SessionType;
        req.isSessionSaved = true; // 标记为已保存，避免尝试保存
        next();
        return;
      }

      // Web 客户端请求：正常处理 Cookie/Session
      // 使用 getIronSession 获取会话实例
      res.session = req.session = await getIronSession<SessionData>(
        req,
        res,
        sessionOptions,
      );

      // 处理从 session 中读取的数据，将序列化的数据转换回原始类型
      if (req.session.user) {
        req.session.user = denormalizeUserData(req.session.user);
      }

      // 保存原始的 res.end 方法
      const originalEnd = res.end;
      const logger = this.logger;

      // 重写 res.end 方法
      res.end = async function (this: MyRes, ...args: any[]) {
        // 在响应结束前保存会话
        if (req.session && !req.isSessionSaved && !res.headersSent) {
          try {
            // 处理session中的BigInt等类型，避免序列化错误
            if (req.session.user) {
              req.session.user = normalizeDataTypes(req.session.user);
            }
            await req.session.save();
          } catch (saveError) {
            logger.error('保存 session 失败: ' + saveError);
          }
        }
        // 调用原始的 end 方法
        return originalEnd.apply(this, args);
      } as any;

      next();
    } catch (error) {
      this.logger.error('请求初始化失败: ' + error);
      res.status(500).send('请求初始化失败');
    }
  }
}
