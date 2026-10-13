import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/modules-global/logger/service';

/**
 * Upload 模块配置类
 * 从 NestJS ConfigService 加载上传相关配置
 */
@Injectable()
export class UploadConfig {
  // 临时文件目录
  readonly uploadTempDir: string;

  // 分片过期时间 (毫秒)
  readonly chunkExpireTime: number;

  // 缓存过期时间 (毫秒)
  readonly cacheExpireTime: number;

  // 阿里云百炼 qwen-long 配置
  readonly qwenLongApiKey: string;
  readonly qwenLongBaseUrl: string;
  readonly qwenLongModel: string;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(LoggerService) private logger: LoggerService,
  ) {
    const uploadConfig = this.configService.get('upload', {});

    // 临时文件目录
    this.uploadTempDir =
      uploadConfig.UPLOAD_TEMP_DIR ||
      process.env.UPLOAD_TEMP_DIR ||
      './tmp/uploads';

    // 分片过期时间 (默认 1 小时)
    this.chunkExpireTime = parseInt(
      uploadConfig.CHUNK_EXPIRE_TIME ||
        process.env.CHUNK_EXPIRE_TIME ||
        '3600000',
      10,
    );

    // 缓存过期时间 (默认 30 分钟)
    this.cacheExpireTime = parseInt(
      uploadConfig.CACHE_EXPIRE_TIME ||
        process.env.CACHE_EXPIRE_TIME ||
        '1800000',
      10,
    );

    // 阿里云百炼 qwen-long 配置
    this.qwenLongApiKey =
      uploadConfig.QWEN_LONG_API_KEY ||
      process.env.QWEN_LONG_API_KEY ||
      '';

    this.qwenLongBaseUrl =
      uploadConfig.QWEN_LONG_BASE_URL ||
      process.env.QWEN_LONG_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1';

    this.qwenLongModel =
      uploadConfig.QWEN_LONG_MODEL ||
      process.env.QWEN_LONG_MODEL ||
      'qwen-doc-turbo';

    // 验证必需配置
    this.validateConfig();
  }

  private validateConfig(): void {
    const errors: string[] = [];

    if (!this.qwenLongApiKey || this.qwenLongApiKey === '') {
      errors.push('QWEN_LONG_API_KEY is required');
    }

    if (!this.qwenLongBaseUrl || this.qwenLongBaseUrl === '') {
      errors.push('QWEN_LONG_BASE_URL is required');
    }

    if (errors.length > 0) {
      throw new Error(
        `Upload configuration validation failed:\n${errors.join('\n')}`,
      );
    }

    // 记录配置信息（不包含敏感信息）
    this.logger.log('Upload 配置:');
    this.logger.log(`  临时目录: ${this.uploadTempDir}`);
    this.logger.log(`  分片过期时间: ${this.chunkExpireTime}ms`);
    this.logger.log(`  缓存过期时间: ${this.cacheExpireTime}ms`);
    this.logger.log(`  Qwen-Long 基础地址: ${this.qwenLongBaseUrl}`);
    this.logger.log(`  Qwen-Long 模型: ${this.qwenLongModel}`);
    this.logger.log(`  Qwen-Long API Key: ${this.qwenLongApiKey ? '***' + this.qwenLongApiKey.slice(-4) : '未设置'}`);
  }
}
