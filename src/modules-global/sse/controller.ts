import { Controller, Post, Body } from '@nestjs/common';
import { SseService } from './service';
import { HeartbeatDto } from './dto';

@Controller('sse')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  // 新增心跳响应端点
  @Post('heartbeat')
  async heartbeat(@Body() body: HeartbeatDto) {
    const { requestId } = body;

    this.sseService.updateSse(requestId);
    return { status: 'ok' };
  }
}
