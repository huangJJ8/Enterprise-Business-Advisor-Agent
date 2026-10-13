import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { RateLimit } from 'src/decorator';
import { LoggerService } from 'src/modules-global/logger/service';

@Controller()
export class AppController {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  @Post('hellopost')
  postHello(@Body() body: any) {
    this.logger.log('body ' + JSON.stringify(body));
    return {
      code: 0,
      body,
    };
  }

  @Get('rate-limit-demo3')
  @RateLimit({ count: 5, second: 24 * 60 * 60 })
  rateLimitDemo3() {
    return {
      code: 0,
      message: '这是一个有频率限制的接口，同一IP地址60秒内最多调用5次',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  healthCheck() {
    return {
      code: 0,
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memoryUsage: {
        rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    };
  }

}
