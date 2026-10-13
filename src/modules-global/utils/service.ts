/**
 * 全局工具服务类
 * 提供重试机制等工具函数
 */

import { Injectable, Inject } from '@nestjs/common';
import { LoggerService } from 'src/modules-global/logger/service';

/**
 * 重试选项接口
 */
export interface RetryOptions {
  /** 重试次数，默认为3次 */
  retryCount?: number;
  /** 重试间隔时间（毫秒），默认为1000ms */
  delay?: number;
  check?: (result: any) => boolean;
}

@Injectable()
export class UtilsService {
  @Inject(LoggerService)
  private logger!: LoggerService;

  /**
   * 带重试机制的异步函数执行器
   * @param asyncFn 需要执行的异步函数
   * @param options 重试选项配置
   * @returns Promise<T> 返回异步函数的执行结果
   */
  async withRetry<T extends () => Promise<any>>(
    asyncFn: T,
    options: RetryOptions = {},
  ): Promise<ReturnType<T>> {
    const { retryCount = 3, delay = 1000, check = () => true } = options;
    let lastError: Error;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // 执行异步函数
        const result = await asyncFn();

        if (!(await check(result))) {
          throw new Error('检查失败');
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // 处理 Promise.reject 抛出的数据可能没有 message 属性的情况
        const getErrorMessage = (err: any): string => {
          if (err && typeof err.message === 'string') {
            return err.message;
          }
          if (typeof err === 'string') {
            return err;
          }
          if (err && typeof err === 'object') {
            return JSON.stringify(err);
          }
          return '未知错误';
        };

        const errorMessage = getErrorMessage(lastError);

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === retryCount) {
          const errorMsg = `重试失败，已达到最大重试次数 ${retryCount}: ${errorMessage}`;
          this.logger.error(errorMsg, lastError.stack);
          throw lastError;
        }

        // 记录重试日志
        const warnMsg = `第 ${attempt + 1} 次尝试失败，${delay}ms 后进行重试: ${errorMessage}`;
        this.logger.warn(warnMsg);

        // 等待指定时间后重试
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 理论上不会执行到这里，但为了类型安全
    throw lastError!;
  }

  /**
   * HTTP请求重试包装器
   * 专门用于包装HTTP服务请求
   * @param httpRequestFn HTTP请求函数
   * @param options 重试选项配置
   * @returns 返回HTTP请求结果，类型与传入函数返回值一致
   */
  async withHttpRetry<T extends () => Promise<any>>(
    httpRequestFn: T,
    options: RetryOptions = {},
  ): Promise<ReturnType<T>> {
    return this.withRetry(httpRequestFn, options);
  }
}
