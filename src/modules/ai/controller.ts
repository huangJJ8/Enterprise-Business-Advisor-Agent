import { Controller, Post, Body, Query, Req, Res, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AIService } from './service';
import { SseService } from 'src/modules-global/sse/service';
import { LoggerService } from 'src/modules-global/logger/service';
import { LittleNoteChatDto } from './dto';
import { RateLimitKeyEnum } from 'src/types/types';
import { SetTimeout, NoLog, RateLimit } from 'src/decorator';

@Controller('ai')
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly sseService: SseService,
    private readonly logger: LoggerService,
  ) {}

  @SetTimeout(false)
  @NoLog([false, true])
  @RateLimit({ count: 100, second: 24 * 60 * 60, key: RateLimitKeyEnum.SSE })
  @Sse('sseLittleNoteChatTrue')
  stream(
    @Res() res: MyRes,
    @Req() req: MyReq,
    @Query() query: LittleNoteChatDto,
  ) {
    const { prompt } = query;

    let streamNext: (value: unknown) => void = () => {};

    const observableStream = new Observable((observer) => {
      streamNext = observer.next.bind(observer);
    });

    const run = async () => {
      try {
        const { chunks, chunksStop } = await this.aiService.littleNoteStream({
          prompt,
        });

        // 检测客户端断开连接
        res.on('close', async () => {
          const isClientDisconnect =
            req.socket.destroyed && !req.socket.connecting;

          if (isClientDisconnect) {
            this.logger.log('客户端主动断开连接');
          } else {
            this.logger.log('连接关闭（可能是超时或其他原因）');
          }

          try {
            chunksStop();
          } catch (error: any) {
            this.logger.error(error.message);
          }
        });

        for await (const chunk of chunks) {
          this.logger.log('chunk: ' + JSON.stringify(chunk));
          if (chunk) {
            await streamNext({ done: false, value: chunk });
          }
        }

        await streamNext({ done: true, data: null });
      } catch (error: any) {
        this.logger.error(error);
        await streamNext({ error: error.message || '传输错误', done: true });
      }
    };

    run();

    return observableStream;
  }

  @SetTimeout(false)
  @NoLog([false, true])
  @RateLimit({ count: 100, second: 24 * 60 * 60, key: RateLimitKeyEnum.SSE })
  @Post('sseLittleNoteChat')
  async sseLittleNoteChat(
    @Res() res: MyRes,
    @Req() req: MyReq,
    @Body() body: LittleNoteChatDto,
  ) {
    const sseOptions: SseOptions = {
      dev: true,
    };

    const { done, send } = await this.sseService.createSseRequest(
      res,
      req,
      sseOptions,
    );

    const { prompt } = body;

    let chunksStop: (() => Promise<void>) | undefined;

    try {
      const result = await this.aiService.littleNoteStream({
        prompt,
      });

      const { chunks } = result;
      chunksStop = result.chunksStop;

      sseOptions.close = async ({ type }) => {
        this.logger.log(`断开连接，type: ${type}`);
        try {
          if (chunksStop) {
            await chunksStop();
          }
        } catch (error: any) {
          this.logger.error('关闭流时发生错误:', error.message);
        }
      };

      try {
        for await (const chunk of chunks) {
          try {
            this.logger.log('chunk: ' + JSON.stringify(chunk));
            if (chunk) {
              await send(chunk);
            }
          } catch (chunkError: any) {
            this.logger.error('处理chunk时发生错误:', chunkError.message);
            // 继续处理下一个chunk，不中断整个流
          }
        }
      } catch (streamError: any) {
        this.logger.error('流处理过程中发生错误:', streamError.message);
        await send({
          error: '流处理错误: ' + (streamError.message || '未知错误'),
        });
      }

      await done();
    } catch (error: any) {
      this.logger.error('SSE聊天服务发生错误:', error);

      // 确保在发生错误时也能正确关闭流
      if (chunksStop) {
        try {
          await chunksStop();
        } catch (stopError: any) {
          this.logger.error('停止流时发生错误:', stopError.message);
        }
      }

      try {
        await send({
          error: error.message || '服务器内部错误',
        });
        await done();
      } catch (sendError: any) {
        this.logger.error('发送错误响应时失败:', sendError.message);
      }
    }
  }
}
