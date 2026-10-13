import { Injectable, Inject } from '@nestjs/common';
import * as fs from 'fs';
import axios from 'axios';
import * as FormData from 'form-data';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadConfig } from '../config/upload.config';

/**
 * 阿里云百炼 File API 响应结构
 */
interface AliyunFileResponse {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
}

/**
 * AliyunFileService
 * 负责将文件上传至阿里云百炼模型服务（OpenAI File 接口）
 */
@Injectable()
export class AliyunFileService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  constructor(private readonly uploadConfig: UploadConfig) {}

  /**
   * 上传文件到阿里云百炼 OpenAI File 接口
   * @param filePath 本地文件路径
   * @param fileName 文件名
   * @returns file_id
   */
  async uploadFile(filePath: string, fileName: string): Promise<string> {
    const url = `${this.uploadConfig.qwenLongBaseUrl}/files`;

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: fileName,
    });
    form.append('purpose', 'file-extract');

    this.logger.log(`正在上传文件到阿里云: ${fileName}`);

    try {
      const response = await axios.post<AliyunFileResponse>(url, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${this.uploadConfig.qwenLongApiKey}`,
        },
        timeout: 60000,
      });

      const fileId = response.data.id;

      if (!fileId) {
        throw new Error(
          `Aliyun File API returned empty file_id for ${fileName}`,
        );
      }

      this.logger.log(
        `文件上传成功: ${fileName} -> file_id=${fileId}`,
      );

      return fileId;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        this.logger.error(
          `阿里云文件上传失败: ${fileName}, 状态码: ${status}, 信息: ${message}`,
        );
        throw new Error(
          `阿里云文件上传失败 (${status || 'NETWORK_ERROR'}): ${message}`,
        );
      }
      const errMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `阿里云文件上传失败: ${fileName}, 错误: ${errMsg}`,
      );
      throw error;
    }
  }
}
