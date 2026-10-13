import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadConfig } from '../config/upload.config';

/**
 * Qwen-Doc-Turbo 模型 API 响应结构（DashScope 兼容模式）
 */
interface QwenDocChatResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

/**
 * QwenLongService
 * 使用 qwen-doc-turbo 模型提取上传文件的结构化内容
 * 通过 DashScope 兼容模式 HTTP 接口独立调用，与 Agent LLM 完全解耦
 */
@Injectable()
export class QwenLongService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  constructor(private readonly uploadConfig: UploadConfig) {}

  /**
   * 使用 qwen-doc-turbo 模型提取文件内容
   * @param fileId 阿里云百炼文件 ID（由 AliyunFileService 上传后返回）
   * @returns 提取的结构化文件内容
   */
  async extractContent(fileId: string): Promise<string> {
    const url = `${this.uploadConfig.qwenLongBaseUrl}/chat/completions`;

    this.logger.log(`正在提取文件内容, fileId: ${fileId}`);

    const startTime = Date.now();
    try {
      const response = await axios.post<QwenDocChatResponse>(
        url,
        {
          model: this.uploadConfig.qwenLongModel,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'system', content: `fileid://${fileId}` },
            {
              role: 'user',
              content: '请提取文件的完整文本内容，保持原有的展示顺序',
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.uploadConfig.qwenLongApiKey}`,
          },
          timeout: 600000, // 10 分钟，大文件提取耗时较长
        },
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `Qwen-Doc-Turbo 调用耗时: ${duration}ms (${(duration / 1000).toFixed(1)}s), fileId: ${fileId}`,
      );

      const content = response.data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(
          `Qwen-Doc-Turbo returned empty content for fileId: ${fileId}`,
        );
      }

      this.logger.log(
        `文件内容提取成功, fileId: ${fileId}, 内容: ${content}`,
      );

      return content;
    } catch (error) {
      const duration = Date.now() - startTime;
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        this.logger.error(
          `文件内容提取失败, fileId: ${fileId}, 耗时: ${duration}ms (${(duration / 1000).toFixed(1)}s), 状态码: ${status}, 信息: ${message}`,
        );
        throw new Error(
          `Qwen-Doc-Turbo 内容提取失败 (${status || 'NETWORK_ERROR'}): ${message}`,
        );
      }
      const errMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `文件内容提取失败, fileId: ${fileId}, 耗时: ${duration}ms (${(duration / 1000).toFixed(1)}s), 错误: ${errMsg}`,
      );
      throw error;
    }
  }
}
