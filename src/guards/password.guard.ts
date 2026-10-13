/*
 * @file:
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

import { LoggerService } from 'src/modules-global/logger/service';

@Injectable()
export class PasswordGuard implements CanActivate {
  constructor(
    private logger: LoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取控制器类名和处理方法名
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    // const result = await this.showService.checkShowPasswordStatus();
    // const isValid = result.code === 0;

    // this.logger.log(
    //   `PasswordGuard验证 - 模块: ${controllerName}, 方法: ${handlerName}, 验证结果: ${isValid ? '通过' : '未通过'}, 状态码: ${result.code}`,
    // );

    // if (!isValid) {
    //   throw new ForbiddenException({
    //     code: 403,
    //     message: '验证码错误或已过期',
    //   });
    // }

    return true;
  }
}
