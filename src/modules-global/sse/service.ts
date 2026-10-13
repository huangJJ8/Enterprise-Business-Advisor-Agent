import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from 'src/modules-global/logger/service';
import { RedisService } from 'src/modules-global/redis/service';

interface MapItem {
  lastHeartbeatTime: number;
}
@Injectable()
export class SseService {
  @Inject(LoggerService)
  private logger!: LoggerService;

  constructor(private readonly redisService: RedisService) {}

  public async createSseRequest(res: MyRes, req: MyReq, options: SseOptions) {
    res.setHeader('Content-Type', 'text/event-stream'); // 设置内容类型为 SSE
    res.setHeader('Cache-Control', 'no-cache, no-transform'); // 禁用缓存
    res.setHeader('Connection', 'keep-alive'); // 保持连接
    // 和 Content-Length 响应头不能同时使用，因为两者是互斥的
    res.setHeader('Transfer-Encoding', 'chunked'); // 使用分块传输编码
    res.setHeader('X-Accel-Buffering', 'no'); // 针对 Nginx 禁用缓冲
    res.setHeader('X-Content-Type-Options', 'nosniff'); // 防止内容类型嗅探

    res.flushHeaders(); // 刷新响应头

    // 生成唯一的请求ID
    const requestId = `heartbeatId-${uuidv4()}`;

    let timeout: NodeJS.Timeout | null = null;
    let heartbeat: NodeJS.Timeout | null = null;

    const closeAfter = async () => {
      this.removeSse(requestId);
      timeout && clearTimeout(timeout);
      heartbeat && clearInterval(heartbeat);
    };

    // 先保存会话，再开始流式响应
    if (req.session) {
      req.isSessionSaved = true;
      //await req.session.save();
    }

    // 保存连接信息
    await this.addSse(requestId);

    // 调试日志 - 异步执行，不阻塞主流程
    this.getSseMap().then((map) => {
      this.logger.log('保存连接信息 ' + JSON.stringify(map));
    }).catch((err) => {
      this.logger.error('获取SSE Map失败 ' + err);
    });

    // 定期发送心跳包（每30秒）
    // 如果 dev 为 true，则不启用心跳检测
    if (!options.dev) {
      heartbeat = setInterval(async () => {
        const connection = await this.getSse(requestId);
        if (!connection) return;

        const now = Date.now();
        // 如果超过60秒没有收到客户端的心跳响应，认为是僵尸连接
        if (now - connection.lastHeartbeatTime > 60 * 1000) {
          this.logger.log('检测到僵尸连接，自动关闭');
          closeAfter();
          res.end();
          await options.close?.({ type: 2, message: '检测到僵尸连接，自动关闭' });
          return;
        }

        try {
          // 🔥 优化：确保心跳消息真正发送
          const heartbeatData = `data: ${JSON.stringify({ type: 'heartbeat', requestId, timestamp: Date.now() })}\n\n`;
          res.write(heartbeatData);

          // 🔥 关键：强制刷新缓冲区
          if (typeof res.flush === 'function') {
            res.flush();
          }
          // 对于某些 Node.js 版本，可能需要使用 flushHeaders
          if (
            typeof (res as any).flushHeaders === 'function' &&
            !res.headersSent
          ) {
            (res as any).flushHeaders();
          }
        } catch (error: any) {
          this.logger.error('心跳发送失败', error);
          closeAfter();
          res.end();
        }
      }, 30 * 1000);
    }

    // 检测客户端断开连接
    res.on('close', async () => {
      const isClientDisconnect = req.socket.destroyed && !req.socket.connecting;

      if (isClientDisconnect) {
        this.logger.log('客户端主动断开连接');
      } else {
        this.logger.log('连接关闭（可能是超时或其他原因）');
      }
      closeAfter();
      await options.close?.({ type: 0, message: '客户端断开连接' });
    });

    return {
      done: async () => {
        closeAfter();
        res.write('data: [DONE]\n\n');
        if (typeof res.flush === 'function') {
          res.flush();
        }
        res.end();
      },
      send: async (data: any) => {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          // 🔥 强制刷新缓冲区
          if (typeof res.flush === 'function') {
            res.flush();
          }
        } catch (error: any) {
          this.logger.error('SSE 发送失败', error);
          throw error;
        }
      },
    };
  }

  addSse(requestId: string) {
    this.redisService.hashSet({
      key: requestId,
      obj: { lastHeartbeatTime: Date.now() },
      ttl: 30 * 60,
    });
  }

  async removeSse(requestId: string) {
    await this.redisService.deleteKeys({ keys: requestId });
  }

  // get不能当做has使用，如果requestId存在，并且值为null或者0
  // 那么 get 会返回null，（而has会返回true，因为它是存在的）
  // 那么 sseData 这个值在下面判断就不对了
  async hasSse(requestId: string) {
    return await this.redisService.keyExists({ key: requestId });
  }

  async getSse(requestId: string) {
    return await this.redisService.hashGet<MapItem>({ key: requestId });
  }

  async updateSse(requestId: string) {
    this.logger.log('请求SSEID-all ' + JSON.stringify(await this.getSseMap()));
    if (await this.hasSse(requestId)) {
      this.addSse(requestId);
    } else {
      this.logger.log('无效的请求SSEID-all ' + JSON.stringify(await this.getSseMap()));
      throw new BadRequestException('无效的请求SSEID');
    }
  }

  async getSseMap() {
    return await this.redisService.getHashKeysWithPrefix('heartbeatId-');
  }

  // async clearSseMap() {
  //   await this.redisService.deleteKeys({ keys: 'heartbeatId-*' });
  // }
}
