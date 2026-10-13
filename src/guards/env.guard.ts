import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getEnv } from 'src/config';

@Injectable()
export class EnvGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const env = this.reflector.getAllAndOverride<Env>(
      'env',
      // 装饰器可以支撑方法和类
      [context.getHandler(), context.getClass()],
    );

    if (getEnv() !== env) {
      throw new ForbiddenException(`此接口仅在 ${env} 环境下可用`);
    }

    return true;
  }
}