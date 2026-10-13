import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as express from 'express';

@Injectable()
export class JsonBodyParserMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    express.json({ limit: '5mb' })(req, res, next);
  }
}

@Injectable()
export class UrlEncodedBodyParserMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    express.urlencoded({ extended: true, limit: '5mb' })(req, res, next);
  }
}
