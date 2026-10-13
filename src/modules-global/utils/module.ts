/**
 * 全局工具模块
 * 提供重试机制等工具服务
 */

import { Global, Module } from '@nestjs/common';
import { UtilsService } from './service';

@Global()
@Module({
  providers: [UtilsService],
  exports: [UtilsService],
})
export class UtilsModule {}