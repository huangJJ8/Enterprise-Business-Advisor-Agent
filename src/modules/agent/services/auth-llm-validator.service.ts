/**
 * 授权文件大模型校验服务
 * 使用千问长文本模型（qwen-long）对上传的授权文件进行合规性校验
 * 复用 QwenLongService 的 DashScope 兼容模式调用模式
 */
import { Injectable, Inject } from '@nestjs/common';
import { AxiosHeaders } from 'axios';
import { LoggerService } from 'src/modules-global/logger/service';
import { HttpService } from 'src/modules-global/http/service';
import { UploadConfig } from 'src/modules/upload/config/upload.config';

/**
 * 大模型校验请求参数
 */
export interface LLMValidationParams {
  /** 百炼文件 ID 数组（支持多文件） */
  fileIds: string[];
  /** 目标企业名称 */
  enterpriseName: string;
}

/**
 * 大模型校验结果
 */
export interface LLMValidationResult {
  /** 校验是否通过（"1" 为通过） */
  passed: boolean;
  /** 校验失败原因 */
  reason?: string;
}

/**
 * DashScope 兼容模式 API 响应结构
 */
interface QwenLongChatResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

/** 校验使用的模型名称 */
const VALIDATION_MODEL = 'qwen-long';

@Injectable()
export class AuthLLMValidatorService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  constructor(
    private readonly uploadConfig: UploadConfig,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 构造授权文件校验 prompt
   * @param enterpriseName 目标企业名称
   * @returns 校验 prompt 字符串
   * 
   * '3. 有效期合理性：授权文件是否标注了有效期，且有效期尚未过期；',
   */
  private buildValidationPrompt(enterpriseName: string): string {
    return [
      `请校验该文件是否为针对"${enterpriseName}"的有效授权文件，依次检查以下内容：`,
      '1. 授权对象匹配：文件中的被授权方或授权对象是否包含上述企业名称；',
      '2. 文件有效性：文件内容是否为正式的授权文件（如授权书、委托书等），而非无关文档；',
      '3. 授权范围覆盖：授权范围是否覆盖信息查询、数据访问等业务操作。',
      '',
      '如果以上全部通过，仅返回 "1"。',
      '如果任一项不通过，返回 "0"，并在后面用竖线分隔说明失败原因，格式为 "0|失败原因说明"。',
      '请严格按照上述格式返回，不要返回其他内容。',
    ].join('\n');
  }

  /**
   * 解析大模型返回的校验结果
   * @param content 大模型返回的原始内容
   * @returns 校验结果
   */
  parseValidationResult(content: string): LLMValidationResult {
    const trimmed = content.trim();

    // 通过：返回内容为 "1"
    if (trimmed === '1') {
      return { passed: true };
    }

    // 失败：返回内容以 "0" 开头
    if (trimmed.startsWith('0')) {
      // 提取失败原因（格式："0|失败原因"）
      const reason = trimmed.includes('|')
        ? trimmed.substring(trimmed.indexOf('|') + 1).trim()
        : '授权文件校验未通过';
      return { passed: false, reason };
    }

    // 异常返回值：既不是 "1" 也不是 "0" 开头
    this.logger.warn(`大模型返回非预期结果: ${trimmed}`);
    return {
      passed: false,
      reason: '文件校验结果异常，请重新上传',
    };
  }

  /**
   * 调用千问长文本模型校验授权文件内容
   * @param params 校验参数（fileId + 企业名称）
   * @returns 校验结果
   */
  async validate(params: LLMValidationParams): Promise<LLMValidationResult> {
    const { fileIds, enterpriseName } = params;

    if (!fileIds || fileIds.length === 0 || !enterpriseName) {
      this.logger.warn('大模型校验参数不完整');
      return {
        passed: false,
        reason: '校验参数不完整',
      };
    }

    const url = `${this.uploadConfig.qwenLongBaseUrl}/chat/completions`;
    const prompt = this.buildValidationPrompt(enterpriseName);

    this.logger.log(
      `开始大模型授权文件校验, fileIds: ${fileIds.join(',')}, 企业: ${enterpriseName}`,
    );

    // 每个文件一条 system message
    const fileMessages = fileIds.map((id) => ({
      role: 'system' as const,
      content: `fileid://${id}`,
    }));

    const headers = new AxiosHeaders();
    headers.set('Authorization', `Bearer ${this.uploadConfig.qwenLongApiKey}`);

    const startTime = Date.now();
    try {
      const response = await this.httpService.post({
        url,
        data: {
          model: VALIDATION_MODEL,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...fileMessages,
            { role: 'user', content: prompt },
          ],
        },
        headers,
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `大模型校验调用耗时: ${duration}ms (${(duration / 1000).toFixed(1)}s), fileIds: ${fileIds.join(',')}`,
      );

      const respData = response.data as QwenLongChatResponse;
      const content = respData?.choices?.[0]?.message?.content;

      if (!content) {
        this.logger.warn(
          `大模型返回空内容, fileIds: ${fileIds.join(',')}`,
        );
        return {
          passed: false,
          reason: '文件校验结果异常，请重新上传',
        };
      }

      this.logger.log(
        `大模型校验原始返回: ${content}, fileIds: ${fileIds.join(',')}`,
      );

      return this.parseValidationResult(content);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `大模型校验异常, fileIds: ${fileIds.join(',')}, 耗时: ${duration}ms, 错误: ${errMsg}`,
      );
      return {
        passed: false,
        reason: '文件校验服务暂时不可用，请稍后重试',
      };
    }
  }
}
