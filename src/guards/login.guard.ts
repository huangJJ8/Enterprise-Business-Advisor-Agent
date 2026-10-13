import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';


@Injectable()
export class LoginGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MyReq>();

    return true
  }
}
