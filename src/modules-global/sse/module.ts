import { Module, Global } from '@nestjs/common';
import { SseService } from './service';
import { SseController } from './controller';

@Global()
@Module({
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
