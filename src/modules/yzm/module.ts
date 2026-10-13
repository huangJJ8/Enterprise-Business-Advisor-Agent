import { Module, Global } from '@nestjs/common';
import { YzmService } from './service';
import { YzmController } from './controller';

@Global()
@Module({
  controllers: [YzmController],
  providers: [YzmService],
  exports: [YzmService],
})
export class YzmModule {}
