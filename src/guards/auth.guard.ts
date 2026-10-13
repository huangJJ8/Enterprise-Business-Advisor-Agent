import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// AuthGuard 需要在 providers 中注册是因为它需要依赖注入自定义服务（UserService），
// 这样 NestJS 才能正确管理它的生命周期和依赖关系。
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MyReq>();

    const auth = this.reflector.getAllAndOverride<number>('auth', [
      context.getHandler(),
      context.getClass(),
    ]);

    return true;
  }
}
