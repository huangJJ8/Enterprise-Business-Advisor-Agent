import {
  createParamDecorator,
  ExecutionContext,
  UseGuards,
  applyDecorators,
  SetMetadata,
} from '@nestjs/common';

import {
  LoginGuard,
  EnvGuard,
  AuthGuard,
  RateLimitGuard,
  PasswordGuard,
  YzmGuard,
} from 'src/guards';
import { Admin } from 'src/utils/state/auth';

export const Session = createParamDecorator(
  // 注意第一个参数data是肯定存在的，装饰没有传递参数时，data是undefined
  // 如果装饰器传递了参数，那么data就是传递的参数
  // 如果传递多个参数，那么data只取第一个参数，剩下的参数舍弃掉
  // ctx是ExecutionContext类型，包含了请求的上下文信息，包括请求对象、响应对象等
  (data: unknown, ctx: ExecutionContext) => {
    const session = ctx.switchToHttp().getRequest<MyReq>().session;
    return session;
  },
);

export const UserInfo = createParamDecorator(
  async (data: string, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<MyReq>();
    const { moduleRef } = req;

    try {
      return {}
    } catch (error) {
      return undefined;
    }
  },
);

export const RequireLogin = () => {
  return UseGuards(LoginGuard);
};

/**
 *
 * @returns
 */
export const DevOnly = () => {
  return applyDecorators(SetMetadata('env', 'dev'), UseGuards(EnvGuard));
};

export const PreOnly = () => {
  return applyDecorators(SetMetadata('env', 'pre'), UseGuards(EnvGuard));
};

export const ProdOnly = () => {
  return applyDecorators(SetMetadata('env', 'prod'), UseGuards(EnvGuard));
};

/**
 *
 * @param auth
 * @returns
 */
export const Auth = (auth: number) => {
  return applyDecorators(SetMetadata('auth', auth), UseGuards(AuthGuard));
};

/**
 * 管理员权限
 * @returns
 */
export const AdminOnly = () => {
  return applyDecorators(SetMetadata('auth', Admin), UseGuards(AuthGuard));
};

/**
 * 标记接口不需要超时限制
 * @returns
 */
export const SetTimeout = (timeout: number | boolean = true) => {
  return applyDecorators(SetMetadata('SetTimeout', timeout));
};

/**
 * 标记接口不需要响应日志
 * @returns
 */
export const NoLog = (data: [boolean, boolean] = [true, true]) => {
  return applyDecorators(SetMetadata('NoLog', data));
};

/**
 * 接口频率限制装饰器
 * @param count 允许的最大调用次数
 * @param second 时间窗口（秒）
 * @returns 装饰器函数
 * @example
 * // 限制同一IP地址60秒内最多调用10次
 * @RateLimit({ count: 10, second: 60 })
 * async someApi() {
 *   // 接口逻辑
 * }
 */
export const RateLimit = (payload: RateLimitDecoratorPayload) => {
  return applyDecorators(
    SetMetadata('rateLimit', payload),
    UseGuards(RateLimitGuard),
  );
};

/**
 * 检查密码装饰器
 * @returns
 */
export const Password = () => {
  return applyDecorators(UseGuards(PasswordGuard));
};

/**
 * 检查验证码装饰器
 * @returns
 */
export const Yzm = () => {
  return applyDecorators(UseGuards(YzmGuard));
};
