import { Module, Global } from '@nestjs/common';

import { HttpService } from './service';

import { AxiosModule } from './axios/module';

@Global()
@Module({
  // 表示该模块依赖于 AxiosModule。
  imports: [AxiosModule],
  // 数组中定义了该模块提供的服务。
  providers: [HttpService], // 是一个自定义的 HTTP 服务
  // 表示该模块导出了 HttpService，使其可以在其他模块中使用。
  exports: [HttpService],
})
export class HttpModule {}
