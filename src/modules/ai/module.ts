import { Module } from '@nestjs/common';
import { AIService } from './service';

import { AIController } from './controller';

@Module({
  imports: [],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService], // 导出 AIService 供其他模块使用
})
export class AIModule {}
