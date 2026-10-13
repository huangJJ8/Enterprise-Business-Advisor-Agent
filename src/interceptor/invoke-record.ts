import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Inject,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Observable,
  tap,
  catchError,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';
import { getJsonLog } from 'src/utils';

import { LoggerService } from 'src/modules-global/logger/service';

const TIMEOUT = 60000;
@Injectable()
export class InvokeRecordInterceptor implements NestInterceptor {
  @Inject(LoggerService)
  private logger!: LoggerService;

  @Inject(Reflector)
  private reflector!: Reflector;

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<MyReq>();
    const userAgent = request.headers['user-agent'];

    const { clientIp, method, path, params, body, query } = request;

    // 检查是否标记了不需要超时
    const SetTimeout =
      this.reflector.get<boolean | number>(
        'SetTimeout',
        context.getHandler(),
      ) ?? true;

    // 检查是否标记了不需要响应日志
    const [noReqLog, noResLog] = this.reflector.get<[boolean, boolean]>(
      'NoLog',
      context.getHandler(),
    ) || [false, false];

    const commonLog = getJsonLog({
      [path]: '',
      [method]: '',
      body,
      query,
      params,
      [context.getClass().name]: '',
      [context.getHandler().name]: '',
      clientIp,
      userAgent,
    });

    if (!noReqLog) {
      this.logger.log(getJsonLog({ '[REQ:BFF]': '', [commonLog]: '' }));
    }

    const now = Date.now();

    const tapOperator = tap((res) => {
      if (!noResLog) {
        const resLog = getJsonLog({
          [path]: '',
          [method]: '',
        });

        this.logger.log(
          getJsonLog({
            '[RES:BFF]': '',
            [resLog]: '',
            time: `${Date.now() - now}ms`,
            Response: res,
            [context.getClass().name]: '',
            [context.getHandler().name]: '',
          }),
        );
      }
    });

    const catchOperator = catchError((err) => {
      // 捕获超时异常
      if (err instanceof TimeoutError) {
        this.logger.error(
          getJsonLog({
            '[TIMEOUT]': '',
            [commonLog]: '',
            message: err.message,
            stack: err.stack,
          }),
        );
        return throwError(() => new RequestTimeoutException());
      }
      // 捕获其他异常
      this.logger.error(
        getJsonLog({
          '[ERROR]': '',
          [commonLog]: '',
          message: err.message,
          stack: err.stack,
        }),
      );
      return throwError(() => err);
    });

    // 根据是否标记了不需要超时来决定管道操作
    if (SetTimeout === false) {
      return next.handle().pipe(tapOperator, catchOperator);
    }

    if (typeof SetTimeout === 'number') {
      return next
        .handle()
        .pipe(tapOperator, timeout(SetTimeout), catchOperator);
    }
    return next.handle().pipe(tapOperator, timeout(TIMEOUT), catchOperator);
  }
}
