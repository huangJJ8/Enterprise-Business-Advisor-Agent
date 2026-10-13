import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/modules-global/logger/service';

/**
 * Agent 配置类
 * 从 NestJS ConfigService 加载配置
 */
@Injectable()
export class AgentConfig {
  // 后端服务 URL
  readonly serviceUrl: string;

  // saasCheck 服务地址（报告相关）
  readonly saasCheckUrl: string;

  // MDS 数据中台服务地址（saasReport 三方接口）
  readonly mdsServiceUrl: string;

  // 企业模糊搜索服务地址
  readonly dataServiceUrl: string;

  // Agent 对外公开访问地址（用于拼接 PDF 预览等绝对路径）
  readonly agentPublicUrl: string;

  // 企业上下游关系查询服务地址
  readonly relationshipServiceUrl: string;

  // LLM 配置
  readonly modelName: string;
  readonly apiKey: string;
  readonly baseURL: string;
  readonly temperature: number;
  readonly maxTokens: number;

  // 知识库配置
  readonly knowledgeBaseEnabled: boolean;
  readonly knowledgeBaseTopK: number;

  // 会话配置
  readonly sessionMaxAge: number; // 毫秒

  // 产品匹配白名单
  readonly productMatchWhitelist: string[];

  // 授权校验产品编码
  readonly productCode: string;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(LoggerService) private logger: LoggerService,
  ) {
    // 从 ConfigService 读取配置（从 YAML 文件加载）
    const agentConfig = this.configService.get('agent', {});

    this.logger.log('=== Agent 配置调试 ===');
    this.logger.log('process.env.AGENT_API_KEY: ' + process.env.AGENT_API_KEY);
    this.logger.log('==========================');

    // 后端服务配置
    this.serviceUrl = agentConfig.SERVICE_URL;

    // saasCheck 服务地址
    this.saasCheckUrl = agentConfig.SAAS_CHECK_URL;

    // MDS 数据中台服务地址
    this.mdsServiceUrl = agentConfig.MDS_SERVICE_URL;

    // 企业模糊搜索服务地址
    this.dataServiceUrl = agentConfig.DATA_SERVICE_URL;

    // Agent 对外公开访问地址
    this.agentPublicUrl = agentConfig.AGENT_PUBLIC_URL || '';

    // 企业上下游关系查询服务地址
    this.relationshipServiceUrl = agentConfig.RELATIONSHIP_SERVICE_URL;

    // LLM 配置
    this.modelName = agentConfig.AGENT_MODEL_NAME;

    this.apiKey = agentConfig.AGENT_API_KEY;

    this.baseURL = agentConfig.AGENT_BASE_URL;

    this.temperature = parseFloat(
      agentConfig.AGENT_TEMPERATURE || process.env.AGENT_TEMPERATURE || '0.7',
    );

    this.maxTokens = parseInt(
      agentConfig.AGENT_MAX_TOKENS || process.env.AGENT_MAX_TOKENS || '16000',
      10,
    );

    // 知识库配置
    this.knowledgeBaseEnabled =
      agentConfig.AGENT_KB_ENABLED === true ||
      process.env.AGENT_KB_ENABLED === 'true';

    this.knowledgeBaseTopK = parseInt(
      agentConfig.AGENT_KB_TOP_K || process.env.AGENT_KB_TOP_K || '4',
      10,
    );

    // 会话配置
    this.sessionMaxAge = parseInt(
      agentConfig.AGENT_SESSION_MAX_AGE ||
        process.env.AGENT_SESSION_MAX_AGE ||
        '3600000',
      10,
    );

    // 产品匹配白名单
    this.productMatchWhitelist =
      agentConfig.AGENT_PRODUCT_MATCH_WHITELIST || [];

    // 授权校验产品编码
    this.productCode = agentConfig.PRODUCT_CODE || 'DataCheck_TC';

    // 验证必需配置
    this.validateConfig();
  }

  private validateConfig(): void {
    const errors: string[] = [];

    if (!this.serviceUrl) {
      errors.push('SERVICE_URL is required');
    }

    if (!this.relationshipServiceUrl) {
      errors.push('RELATIONSHIP_SERVICE_URL is required');
    }

    if (!this.apiKey || this.apiKey === '') {
      errors.push('AGENT_API_KEY is required');
    }

    if (!this.baseURL || this.baseURL === '') {
      errors.push('AGENT_BASE_URL is required');
    }

    if (errors.length > 0) {
      throw new Error(
        `Agent configuration validation failed:\n${errors.join('\n')}`,
      );
    }

    // 记录配置信息（不包含敏感信息）
    this.logger.log('Agent 配置:');
    this.logger.log(`  服务地址: ${this.serviceUrl}`);
    this.logger.log(`  saasCheck地址: ${this.saasCheckUrl}`);
    this.logger.log(`  MDS服务地址: ${this.mdsServiceUrl}`);
    this.logger.log(`  企业关系服务地址: ${this.relationshipServiceUrl}`);
    this.logger.log(`  模型: ${this.modelName}`);
    this.logger.log(`  基础地址: ${this.baseURL}`);
    this.logger.log(`  温度: ${this.temperature}`);
    this.logger.log(`  最大 Token 数: ${this.maxTokens}`);
    this.logger.log(
      `  API Key: ${this.apiKey ? '***' + this.apiKey.slice(-4) : '未设置'}`,
    );
    this.logger.log(
      `  产品匹配白名单: ${JSON.stringify(this.productMatchWhitelist)}`,
    );
  }
}
