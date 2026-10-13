import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { LoggerService } from 'src/modules-global/logger/service';

import { uuid, getJsonLog } from 'src/utils';

@Injectable()
export class FilterMiddleware implements NestMiddleware {
  @Inject(LoggerService)
  private logger!: LoggerService;

  use(request: MyReq, response: MyRes, next: () => void) {
    //console.log('request', request.headers);
    this.logger.log('before');

    // const XTransactionID = uuid();

    // request.XTransactionID = XTransactionID;

    // const userAgent = request.headers['user-agent'];

    // const { ip, method, path, params, body } = request;

    // this.logger.debug(
    //   getJsonLog({
    //     '[REQ:BFF]': '',
    //     XTransactionID,
    //     method,
    //     path,
    //     params,
    //     body,
    //     ip,
    //     userAgent,
    //   }),
    // );

    // this.logger.debug('logger1');

    response.on('finish', (...arg) => {
      // debugger;
      // 记录结束时间
      //   this.logger.debug('logger2');
      //   console.log(arg, response);
    });

    next();
    this.logger.log('after');
  }
}
