/**
 * 授权接口控制器（异步模式）
 * POST /agent/auth/submit   — 提交授权任务，立即返回 taskId
 * GET  /agent/auth/status    — 轮询任务状态
 *
 * 改造后：前端只传 taskId + uploadId，其余授权上下文从 CacheService 中读取
 * 异步流程：合并分片 → 上传百炼获取 fileId → LLM 校验 → 文件持久化 → 创建授权记录
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { LoggerService } from 'src/modules-global/logger/service';
import { HttpService } from 'src/modules-global/http/service';
import { CacheService } from 'src/modules-global/cache/service';
import { AliyunFileService } from 'src/modules/upload/services/aliyun-file.service';
import { UploadService } from 'src/modules/upload/services/upload.service';
import { AgentConfig } from '../config/agent.config';
import { AuthLLMValidatorService } from '../services/auth-llm-validator.service';
import { AuthFileUploaderService } from '../services/auth-file-uploader.service';
import { AuthCheckerService, AuthCacheData } from '../services/auth-checker.service';
import * as fs from 'fs/promises';

// ─── 请求 / 响应类型 ───

interface AuthSubmitBody {
  /** 前端传入的 taskId（由 checkAuthAndBuildResponse 预生成） */
  taskId: string;
  /** 分片上传的 uploadId */
  uploadId: string;
}

interface AuthSubmitResponse {
  taskId: string;
}

type AuthTaskStatus = 'processing' | 'success' | 'failed';

interface AuthStatusResponse {
  status: AuthTaskStatus;
  /** 校验是否通过（仅 success 时有值） */
  authPassed?: boolean;
  /** 失败原因 */
  failReason?: string;
  /** 用户原始问题（授权成功时返回，供前端自动重发） */
  originalQuestion?: string;
}

interface AuthCreateApiResponse {
  status?: number;
  message?: string;
  data?: unknown;
}

// ─── 内存任务存储（任务执行状态，与授权上下文缓存分离） ───

interface AuthTaskEntry {
  status: AuthTaskStatus;
  authPassed?: boolean;
  failReason?: string;
  originalQuestion?: string;
  createdAt: number;
}

/** 任务状态过期时间：30 分钟 */
const TASK_TTL = 30 * 60 * 1000;

@Controller('agent/auth')
export class AuthController {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  /** 内存任务表（仅存储任务执行状态） */
  private readonly tasks = new Map<string, AuthTaskEntry>();

  constructor(
    private readonly agentConfig: AgentConfig,
    private readonly llmValidator: AuthLLMValidatorService,
    private readonly fileUploader: AuthFileUploaderService,
    private readonly httpService: HttpService,
    private readonly uploadService: UploadService,
    private readonly aliyunFileService: AliyunFileService,
    private readonly authCheckerService: AuthCheckerService,
    private readonly cacheService: CacheService,
  ) {}

  // ─── POST /agent/auth/submit ───

  @Post('submit')
  async submit(@Body() body: AuthSubmitBody): Promise<AuthSubmitResponse> {
    const { taskId, uploadId } = body;

    if (!taskId || !uploadId) {
      throw new BadRequestException('缺少必要参数 taskId 或 uploadId');
    }

    // 从缓存读取授权上下文
    const authData = this.authCheckerService.getAuthCacheData(taskId);
    if (!authData) {
      throw new BadRequestException('授权信息已过期或不存在，请重新发起查询');
    }

    // 存入内存任务表，状态 processing
    this.tasks.set(taskId, {
      status: 'processing',
      originalQuestion: authData.originalQuestion,
      createdAt: Date.now(),
    });

    this.logger.log(
      `授权任务已创建, taskId: ${taskId}, 企业: ${authData.enterpriseName}, uploadId: ${uploadId}`,
    );

    // 异步执行，不阻塞返回
    this.processInBackground(taskId, uploadId, authData);

    return { taskId };
  }

  // ─── GET /agent/auth/status ───

  @Get('status')
  async getStatus(@Query('taskId') taskId: string): Promise<AuthStatusResponse> {
    if (!taskId) {
      throw new BadRequestException('taskId 不能为空');
    }

    const entry = this.tasks.get(taskId);
    if (!entry) {
      return { status: 'failed', failReason: '任务不存在或已过期' };
    }

    // 过期清理
    if (Date.now() - entry.createdAt > TASK_TTL) {
      this.tasks.delete(taskId);
      return { status: 'failed', failReason: '任务已过期' };
    }

    return {
      status: entry.status,
      authPassed: entry.authPassed,
      failReason: entry.failReason,
      originalQuestion: entry.originalQuestion,
    };
  }

  // ─── 后台异步处理 ───

  private async processInBackground(
    taskId: string,
    uploadId: string,
    authData: AuthCacheData,
  ): Promise<void> {
    const {
      enterpriseName,
      orgNo,
      corpTaxNo,
      subjectName,
      operatorUserId,
      operatorUserName,
    } = authData;

    const totalStart = Date.now();

    try {
      // 步骤 1：合并分片
      this.logger.log(`[授权][${taskId}] 步骤1: 合并分片, uploadId: ${uploadId}`);
      let stepStart = Date.now();
      const mergeResult = await this.uploadService.mergeChunks(uploadId);
      this.logger.log(`[授权][${taskId}] 步骤1结果(${Date.now() - stepStart}ms): ${JSON.stringify(mergeResult)}`);

      if (!mergeResult.success || !mergeResult.files || mergeResult.files.length === 0) {
        throw new Error('文件合并失败，请重新上传');
      }

      // 步骤 2：上传百炼获取 fileId
      this.logger.log(`[授权][${taskId}] 步骤2: 上传百炼, 文件数: ${mergeResult.files.length}`);
      stepStart = Date.now();
      const fileIds: string[] = [];
      for (const file of mergeResult.files) {
        const fileId = await this.aliyunFileService.uploadFile(file.filePath, file.fileName);
        fileIds.push(fileId);
      }
      this.logger.log(`[授权][${taskId}] 步骤2结果(${Date.now() - stepStart}ms): ${JSON.stringify(fileIds)}`);

      // 步骤 3：LLM 校验
      this.logger.log(`[授权][${taskId}] 步骤3: LLM 校验, fileIds: ${fileIds.join(',')}`);
      stepStart = Date.now();
      const validationResult = await this.llmValidator.validate({ fileIds, enterpriseName });
      this.logger.log(`[授权][${taskId}] 步骤3结果(${Date.now() - stepStart}ms): ${JSON.stringify(validationResult)}`);

      if (!validationResult.passed) {
        this.setTaskResult(taskId, 'success', false, validationResult.reason || '授权文件校验未通过');
        return;
      }

      // 步骤 4：文件持久化到 Auth_API
      this.logger.log(`[授权][${taskId}] 步骤4: 文件持久化`);
      stepStart = Date.now();
      const authFiles: Array<{ fileKey: string; fileName: string }> = [];
      for (const file of mergeResult.files) {
        const fileBuffer = await fs.readFile(file.filePath);
        const uploadResult = await this.fileUploader.upload(fileBuffer, file.fileName);
        authFiles.push({
          fileKey: uploadResult.authFileId,
          fileName: uploadResult.authFileName,
        });
      }
      this.logger.log(`[授权][${taskId}] 步骤4结果(${Date.now() - stepStart}ms): ${JSON.stringify(authFiles)}`);

      // 步骤 5：创建授权记录
      this.logger.log(`[授权][${taskId}] 步骤5: 创建授权记录`);
      stepStart = Date.now();
      const now = new Date();
      const startTime = this.formatDateTime(now);
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);
      const endTime = this.formatDateTime(endDate);

      const createParams = {
        orgNo,
        orgName: enterpriseName,
        authScopeType: 'ORG' as const,
        corpTaxNo,
        corpName: subjectName,
        operatorUserId: String(operatorUserId),
        operatorUserName,
        authStatus: 1,
        authFiles,
        startTime,
        endTime,
      };
      await this.createAuthRecord(createParams);
      this.logger.log(`[授权][${taskId}] 步骤5结果(${Date.now() - stepStart}ms): 授权记录创建成功, params: ${JSON.stringify(createParams)}`);

      const duration = Date.now() - totalStart;
      this.logger.log(`[授权][${taskId}] 全流程完成, 耗时: ${duration}ms`);

      this.setTaskResult(taskId, 'success', true);

      // 流程完成后清理授权缓存
      this.authCheckerService.deleteAuthCacheData(taskId);
    } catch (error) {
      const duration = Date.now() - totalStart;
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[授权][${taskId}] 流程失败, 耗时: ${duration}ms, 错误: ${errMsg}`);
      this.setTaskResult(taskId, 'failed', false, errMsg);
    }
  }

  private setTaskResult(taskId: string, status: AuthTaskStatus, authPassed: boolean, failReason?: string): void {
    const entry = this.tasks.get(taskId);
    if (entry) {
      entry.status = status;
      entry.authPassed = authPassed;
      entry.failReason = failReason;
    }
  }

  // ─── Auth_API 调用 ───

  private async createAuthRecord(params: {
    orgNo: string;
    orgName: string;
    authScopeType: 'ORG';
    corpTaxNo: string;
    corpName: string;
    operatorUserId: string;
    operatorUserName: string;
    authStatus: number;
    authFiles: Array<{ fileKey: string; fileName?: string }>;
    startTime: string;
    endTime: string;
  }): Promise<void> {
    const url = `${this.agentConfig.saasCheckUrl}/userAuth/aiStaff/auth/create`;

    if (!params.authFiles.length) {
      throw new Error('authFiles 数组不能为空');
    }
    for (const f of params.authFiles) {
      if (!f.fileKey) throw new Error('authFile 的 fileKey 不能为空');
    }
    if (params.endTime < params.startTime) {
      throw new Error('endTime 必须大于等于 startTime');
    }

    const response = await this.httpService.post({ url, data: params });
    const respData = response.data as AuthCreateApiResponse;
    if (respData?.status !== 200) {
      throw new Error(`授权记录创建失败：${respData?.message || '未知错误'}`);
    }
  }

  private formatDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }
}
