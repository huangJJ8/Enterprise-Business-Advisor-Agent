import { Injectable } from '@nestjs/common';
import { map } from 'rxjs';

import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';

import type { Observable } from 'rxjs';

import { normalizeDataTypes } from 'src/utils';

@Injectable()
export class FormatResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<MyRes>();

    return next.handle().pipe(
      map((data) => {
        const statusCode =
          response.statusCode == 200 || response.statusCode == 201
            ? 200
            : response.statusCode;

        return {
          statusCode,
          message: 'success',
          data: normalizeDataTypes(data),
        };
      }),
    );
  }
}
