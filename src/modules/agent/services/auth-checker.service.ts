/**
 * 授权校验服务
 * 调用 Auth_API 的 GET /userAuth/aiStaff/auth/effective 接口
 * 校验当前用户对目标企业是否有有效授权
 */
import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from 'src/modules-global/logger/service';
import { HttpService } from 'src/modules-global/http/service';
import { CacheService } from 'src/modules-global/cache/service';
import { isDev } from 'src/config';
import { AgentConfig } from '../config/agent.config';

/**
 * 授权校验请求参数
 */
export interface AuthCheckParams {
  /** 机构编号 */
  orgNo: string;
  /** 企业税号 */
  corpTaxNo: string;
}

/**
 * 授权校验结果
 */
export interface AuthCheckResult {
  /** 是否有有效授权 */
  hasAuth: boolean;
  /** 错误信息（仅在校验失败或异常时存在） */
  errorMessage?: string;
}

/**
 * 授权校验并构造响应的参数
 */
export interface AuthCheckWithResponseParams extends AuthCheckParams {
  /** 企业名称 */
  enterpriseName: string;
  /** 主体名称 */
  subjectName: string;
  /** 用户原始问题 */
  originalQuestion: string;
  /** 操作人用户ID */
  operatorUserId: number;
  /** 操作人用户名 */
  operatorUserName: string;
}

/**
 * 授权校验并构造响应的结果
 */
export interface AuthCheckWithResponseResult {
  /** 是否有有效授权 */
  hasAuth: boolean;
  /** 无授权时返回给用户的完整消息（含 <ca> 标签），有授权时为 undefined */
  responseMessage?: string;
}

/**
 * Auth_API 接口原始响应结构
 */
interface AuthEffectiveApiResponse {
  status?: number;
  message?: string;
  success?: boolean;
  data?: {
    hasAuth?: boolean;
    authId?: string;
    authStatus?: string;
    authSource?: string;
    startTime?: string;
    endTime?: string;
  };
}

/**
 * 授权上下文缓存数据（存入通用 CacheService，1小时过期）
 */
export interface AuthCacheData {
  enterpriseName: string;
  orgNo: string;
  corpTaxNo: string;
  subjectName: string;
  originalQuestion: string;
  operatorUserId: number;
  operatorUserName: string;
}

@Injectable()
export class AuthCheckerService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  /** 授权缓存 TTL：1 小时 */
  private static readonly AUTH_CACHE_TTL = 60 * 60 * 1000;

  constructor(
    private readonly agentConfig: AgentConfig,
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 校验用户对目标企业的授权有效性
   * @param params 授权校验参数
   * @returns 授权校验结果
   */
  async checkAuth(params: AuthCheckParams): Promise<AuthCheckResult> {
      const { orgNo, corpTaxNo } = params;

      this.logger.log(
        `开始授权校验-0, orgNo: ${orgNo}, corpTaxNo: ${corpTaxNo}`,
      );

      // 参数完整性校验
      if (!orgNo || !corpTaxNo) {
        this.logger.warn('授权校验参数不完整');
        return {
          hasAuth: false,
          errorMessage: '授权校验参数不完整',
        };
      }

      const url = `${this.agentConfig.saasCheckUrl}/userAuth/aiStaff/auth/effective`;

      this.logger.log(
        `开始授权校验-1, orgNo: ${orgNo}, corpTaxNo: ${corpTaxNo}`,
      );

      try {
        const response = await this.httpService.get({
          url,
          params: {
            authScopeType: 'ORG',
            orgNo,
            corpTaxNo,
          },
        });

        const respData = response.data as AuthEffectiveApiResponse;
        this.logger.log(
          `授权校验返回, orgNo: ${orgNo}, corpTaxNo: ${corpTaxNo}, response: ${JSON.stringify(respData)}`,
        );
        const data = respData?.data;

        // 校验响应数据格式
        if (data == null || typeof data.hasAuth !== 'boolean') {
          this.logger.warn(
            `授权校验返回非预期格式, response: ${JSON.stringify(respData)}`,
          );
          return {
            hasAuth: false,
            errorMessage: '授权校验异常，请稍后重试',
          };
        }

        this.logger.log(
          `授权校验完成, orgNo: ${orgNo}, corpTaxNo: ${corpTaxNo}, hasAuth: ${data.hasAuth}`,
        );

        return {
          hasAuth: data.hasAuth,
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `授权校验失败, orgNo: ${orgNo}, corpTaxNo: ${corpTaxNo}, 错误: ${errMsg}`,
        );
        return {
          hasAuth: false,
          errorMessage: '授权校验失败，请稍后重试',
        };
      }
    }

  /**
   * 校验授权并构造完整的响应消息
   * 无授权时：生成 taskId，将授权上下文存入通用缓存（1小时过期），
   * <ca> 标签只传 taskId + enterpriseName（用于前端展示）
   */
  async checkAuthAndBuildResponse(
      params: AuthCheckWithResponseParams,
    ): Promise<AuthCheckWithResponseResult> {
      const {
        enterpriseName,
        subjectName,
        originalQuestion,
        operatorUserId,
        operatorUserName,
        ...checkParams
      } = params;

      const result = await this.checkAuth(checkParams);

      if (result.hasAuth) {
        return { hasAuth: true };
      }

      // 有错误信息（超时、网络异常等）直接返回错误提示
      if (result.errorMessage) {
        return {
          hasAuth: false,
          responseMessage: result.errorMessage,
        };
      }

      // 生成 taskId，将完整授权上下文存入缓存
      const taskId = uuidv4();
      const cacheData: AuthCacheData = {
        enterpriseName,
        orgNo: checkParams.orgNo,
        corpTaxNo: checkParams.corpTaxNo,
        subjectName,
        originalQuestion,
        operatorUserId,
        operatorUserName,
      };
      this.cacheService.set<AuthCacheData>(
        `auth:${taskId}`,
        cacheData,
        AuthCheckerService.AUTH_CACHE_TTL,
      );

      this.logger.log(`授权上下文已缓存, taskId: ${taskId}, 企业: ${enterpriseName}`);

      // <ca> 只传 taskId 和 enterpriseName（前端展示用）
      const caData = encodeURIComponent(
        JSON.stringify({ taskId, enterpriseName }),
      );

      return {
        hasAuth: false,
        responseMessage: `该企业暂未授权，请先上传授权文件。\n\n<ca data="${caData}">点击上传授权文件</ca>`,
      };
    }

  /**
   * 根据 taskId 获取缓存的授权上下文数据
   */
  getAuthCacheData(taskId: string): AuthCacheData | null {
    return this.cacheService.get<AuthCacheData>(`auth:${taskId}`);
  }

  /**
   * 设置 taskId 对应的授权缓存数据
   */
  setAuthCacheData(taskId: string, data: AuthCacheData): void {
    this.cacheService.set<AuthCacheData>(
      `auth:${taskId}`,
      data,
      AuthCheckerService.AUTH_CACHE_TTL,
    );
  }

  /**
   * 删除 taskId 对应的授权缓存
   */
  deleteAuthCacheData(taskId: string): void {
    this.cacheService.delete(`auth:${taskId}`);
  }
}
