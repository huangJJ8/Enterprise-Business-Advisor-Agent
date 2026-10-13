import { Module } from '@nestjs/common';
import { AxiosService } from './service';

// AxiosModule 通过 HttpModule 间接地被注册到应用中，所以不需要在 AppModule 中导入
@Module({
  providers: [AxiosService],
  exports: [AxiosService],
})
export class AxiosModule {}
