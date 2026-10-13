import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { NextFunction } from 'express';
import { uuid } from 'src/utils';
import * as requestIp from 'request-ip';

import { AsyncContextService } from 'src/modules-global/async-context/service';

/**
 * AsyncContext 中间件
 * 在请求最开始时设置 AsyncLocalStorage 上下文
 * 确保在守卫、拦截器、装饰器执行之前，上下文已经就绪
 */
@Injectable()
export class AsyncContextMiddleware implements NestMiddleware {
  @Inject(AsyncContextService)
  private asyncContext!: AsyncContextService;

  use(req: MyReq, res: MyRes, next: NextFunction) {
    // 生成唯一的事务ID
    const XTransactionID = uuid();
    req.XTransactionID = XTransactionID;
    req.clientIp = requestIp.getClientIp(req) || '';

    // 使用 AsyncLocalStorage 存储上下文，包装整个请求生命周期
    this.asyncContext.run(
      { XTransactionID, request: req, response: res },
      () => {
        next();
      },
    );
  }
}
