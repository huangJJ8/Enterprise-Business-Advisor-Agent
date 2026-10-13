/**
 * 授权文件上传服务
 * 调用 Auth_API 的 POST /userAuth/file/uploadAuthFile 接口
 * 将授权文件持久化至 Auth_API，返回 authFileId 和 authFileName
 */
import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentConfig } from '../config/agent.config';

/**
 * 文件上传结果
 */
export interface FileUploadResult {
  /** 文件唯一标识 */
  authFileId: string;
  /** 文件名称 */
  authFileName: string;
}

/**
 * Auth_API 文件上传接口原始响应结构
 */
interface AuthFileUploadResponse {
  status: number;
  message: string;
  data?: {
    authFileId?: string;
    authFileName?: string;
  };
}

/** 文件上传超时时间：30 秒 */
const UPLOAD_TIMEOUT = 30000;

@Injectable()
export class AuthFileUploaderService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  constructor(private readonly agentConfig: AgentConfig) {}

  /**
   * 上传授权文件至 Auth_API 进行持久化
   * @param file 文件 Buffer
   * @param fileName 文件名称
   * @returns 文件上传结果（authFileId + authFileName）
   * @throws Error 上传失败时抛出异常
   */
  async upload(file: Buffer, fileName: string): Promise<FileUploadResult> {
    const url = `${this.agentConfig.saasCheckUrl}/userAuth/file/uploadAuthFile`;

    this.logger.log(`开始上传授权文件, fileName: ${fileName}`);

    const formData = new FormData();
    formData.append('file', file, { filename: fileName });

    try {
      const response = await axios.post<AuthFileUploadResponse>(
        url,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: UPLOAD_TIMEOUT,
        },
      );

      const { data: respData } = response;

      // 校验响应状态
      if (respData?.status !== 200 || !respData?.data) {
        const msg = respData?.message || '未知错误';
        this.logger.error(
          `授权文件上传失败, fileName: ${fileName}, 响应: ${JSON.stringify(respData)}`,
        );
        throw new Error(`文件保存失败：${msg}`);
      }

      const { authFileId, authFileName } = respData.data;

      // 校验返回数据完整性
      if (!authFileId) {
        this.logger.error(
          `授权文件上传返回数据不完整, fileName: ${fileName}, data: ${JSON.stringify(respData.data)}`,
        );
        throw new Error('文件保存失败：返回数据不完整');
      }

      this.logger.log(
        `授权文件上传成功, fileName: ${fileName}, authFileId: ${authFileId}`,
      );

      return {
        authFileId,
        authFileName: authFileName || fileName,
      };
    } catch (error) {
      // 如果是已经处理过的业务异常，直接抛出
      if (error instanceof Error && error.message.startsWith('文件保存失败')) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;

        if (error.code === 'ECONNABORTED') {
          this.logger.error(
            `授权文件上传超时, fileName: ${fileName}`,
          );
          throw new Error('文件保存失败：上传超时，请重试');
        }

        this.logger.error(
          `授权文件上传失败, fileName: ${fileName}, 状态码: ${status}, 信息: ${message}`,
        );
        throw new Error('文件保存失败，请重试');
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `授权文件上传异常, fileName: ${fileName}, 错误: ${errMsg}`,
      );
      throw new Error('文件保存失败，请重试');
    }
  }
}
