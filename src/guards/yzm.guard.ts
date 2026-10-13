/*
 * @file: 验证码守卫 - 校验请求头中的验证码与 session/Redis 中的验证码是否一致
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request } from 'express';
import { LoggerService } from 'src/modules-global/logger/service';
import { YzmService } from 'src/modules/yzm/service';

import { YzmTypeEnum } from 'src/types/types';

@Injectable()
export class YzmGuard implements CanActivate {
  constructor(
    private logger: LoggerService,
    private yzmService: YzmService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取控制器类名和处理方法名
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    // 获取请求对象和响应对象
    const request = context.switchToHttp().getRequest<Request>();

    const session = request.session as SessionData;

    // 从 header 中获取验证码
    // 自定义 Header 命名规则：使用 X- 前缀 + 大写字母/连字符命名（如 X-YZM）
    // HTTP Header 大小写不敏感，Express 会将其转为小写
    const headerYzm = request.headers['x-yzm'] as string;
    const deviceId = request.headers['x-device-id'] as string | undefined;

    const [type, code] = headerYzm.split(':') as [YzmTypeEnum, string];

    let storedYzm: string | null | undefined;

    // 根据是否有 deviceId 来区分 App 和 Web
    if (deviceId) {
      // App 端：从 Redis 获取验证码
      storedYzm = await this.yzmService.getAppYzm(deviceId, type);
    } else {
      // Web 端：从 session 获取验证码
      storedYzm = session?.yzm?.[type];
    }

    // 校验验证码是否一致
    const isValid = storedYzm && code.toLowerCase() === storedYzm.toLowerCase();

    this.logger.log(
      `YzmGuard验证 - type: ${type}, code: ${code}, storedYzm: ${storedYzm || 'null'}, deviceId: ${deviceId || 'null'}, 验证结果: ${isValid ? '通过' : '未通过'}`,
    );

    if (!isValid) {
      // 返回类似 controller 的业务错误格式
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: '验证码错误',
        data: {
          errors: {
            yzm: ['验证码错误'],
          },
        },
      });
    }

    // 验证成功后，删除 App 端的验证码（防止重复使用）
    if (deviceId) {
      await this.yzmService.deleteAppYzm(deviceId, type);
    }

    return true;
  }
}
