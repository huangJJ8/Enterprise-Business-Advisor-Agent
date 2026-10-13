import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadConfig } from '../config/upload.config';
import { ChunkUploadDto } from '../dto/chunk-upload.dto';
import { AliyunFileService } from './aliyun-file.service';
import { QwenLongService } from './qwen-long.service';
import { CacheManager, DataContentItem } from './cache-manager.service';
import { ReportTaskManager } from './report-task-manager.service';
import { DocxService } from './docx.service';
import { AgentApiService } from 'src/modules/agent/api.service';
import { AgentConfig } from 'src/modules/agent/config/agent.config';
import { ReportFormatterService } from 'src/modules/agent/services/report-formatter.service';
import { UserContext } from 'src/modules/agent/types/agent.types';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { PRESET_TEMPLATES } from '../templates/preset-templates';

/**
 * meta.json 中单个文件的元数据
 */
interface FileMeta {
  fileName: string;
  fileType: 'template' | 'data';
  totalChunks: number;
}

/**
 * meta.json 结构
 */
interface UploadMeta {
  files: FileMeta[];
}

/**
 * 合并结果
 */
export interface MergeResult {
  success: boolean;
  missingChunks?: number[];
  files?: Array<{
    fileName: string;
    fileType: 'template' | 'data';
    filePath: string;
  }>;
}

/**
 * UploadService
 * 负责分片存储、分片完整性校验、文件合并及临时文件定时清理
 */
@Injectable()
export class UploadService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  constructor(
    private readonly uploadConfig: UploadConfig,
    private readonly aliyunFileService: AliyunFileService,
    private readonly qwenLongService: QwenLongService,
    private readonly cacheManager: CacheManager,
    private readonly reportTaskManager: ReportTaskManager,
    private readonly docxService: DocxService,
    @Inject(forwardRef(() => AgentApiService))
    private readonly agentApiService: AgentApiService,
    @Inject(forwardRef(() => AgentConfig))
    private readonly agentConfig: AgentConfig,
    @Inject(forwardRef(() => ReportFormatterService))
    private readonly reportFormatterService: ReportFormatterService,
  ) {}

  /**
   * 保存分片到临时目录
   * 存储路径: {UPLOAD_TEMP_DIR}/{uploadId}/{fileName}_{chunkIndex}
   * 同时更新 meta.json 记录文件元数据
   */
  async saveChunk(
    dto: ChunkUploadDto,
    file: Express.Multer.File,
  ): Promise<void> {
    const uploadDir = path.join(this.uploadConfig.uploadTempDir, dto.uploadId);

    // 确保上传目录存在
    await fs.mkdir(uploadDir, { recursive: true });

    // 以 {fileName}_{chunkIndex} 命名存储分片
    const chunkFileName = `${dto.fileName}_${dto.chunkIndex}`;
    const chunkPath = path.join(uploadDir, chunkFileName);
    await fs.writeFile(chunkPath, file.buffer);

    // 更新 meta.json
    await this.updateMeta(uploadDir, dto);

    this.logger.log(
      `分片已保存: uploadId=${dto.uploadId}, 文件=${dto.fileName}, 分片=${dto.chunkIndex}/${dto.totalChunks}`,
    );
  }

  /**
   * 更新 meta.json 文件
   * 如果文件已存在于 meta 中则跳过，否则追加
   */
  private async updateMeta(
    uploadDir: string,
    dto: ChunkUploadDto,
  ): Promise<void> {
    const metaPath = path.join(uploadDir, 'meta.json');
    let meta: UploadMeta = { files: [] };

    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      meta = JSON.parse(content);
    } catch {
      // meta.json 不存在，使用默认空结构
    }

    // 检查该文件是否已记录
    const exists = meta.files.some((f) => f.fileName === dto.fileName);
    if (!exists) {
      meta.files.push({
        fileName: dto.fileName,
        fileType: dto.fileType,
        totalChunks: dto.totalChunks,
      });
    }

    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  /**
   * 校验分片完整性并合并文件
   * 1. 读取 meta.json 获取文件列表
   * 2. 对每个文件校验 0 到 totalChunks-1 的分片是否齐全
   * 3. 不完整时返回缺失编号列表
   * 4. 完整时按顺序合并为完整文件，合并后删除分片文件
   */
  async mergeChunks(uploadId: string): Promise<MergeResult> {
    const uploadDir = path.join(this.uploadConfig.uploadTempDir, uploadId);
    const metaPath = path.join(uploadDir, 'meta.json');

    // 读取 meta.json
    let meta: UploadMeta;
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      meta = JSON.parse(content);
    } catch {
      this.logger.error(`未找到 meta 文件, uploadId: ${uploadId}`);
      return { success: false, missingChunks: [] };
    }

    // 获取目录中的所有文件
    const dirFiles = await fs.readdir(uploadDir);

    // 收集所有缺失的分片
    const allMissingChunks: number[] = [];

    for (const fileMeta of meta.files) {
      for (let i = 0; i < fileMeta.totalChunks; i++) {
        const chunkFileName = `${fileMeta.fileName}_${i}`;
        if (!dirFiles.includes(chunkFileName)) {
          allMissingChunks.push(i);
        }
      }
    }

    // 如果有缺失分片，返回错误
    if (allMissingChunks.length > 0) {
      this.logger.warn(
        `缺失分片, uploadId=${uploadId}: ${allMissingChunks.join(', ')}`,
      );
      return { success: false, missingChunks: allMissingChunks };
    }

    // 按顺序合并每个文件
    const mergedFiles: Array<{
      fileName: string;
      fileType: 'template' | 'data';
      filePath: string;
    }> = [];

    for (const fileMeta of meta.files) {
      const mergedPath = path.join(uploadDir, fileMeta.fileName);
      const chunkPaths: string[] = [];

      // 按顺序读取并合并分片
      const chunks: Buffer[] = [];
      for (let i = 0; i < fileMeta.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `${fileMeta.fileName}_${i}`);
        chunkPaths.push(chunkPath);
        const chunkData = await fs.readFile(chunkPath);
        chunks.push(chunkData);
      }

      // 写入合并后的文件
      await fs.writeFile(mergedPath, Buffer.concat(chunks));

      // 删除分片文件
      for (const chunkPath of chunkPaths) {
        await fs.unlink(chunkPath);
      }

      mergedFiles.push({
        fileName: fileMeta.fileName,
        fileType: fileMeta.fileType,
        filePath: mergedPath,
      });

      this.logger.log(
        `文件合并完成: ${fileMeta.fileName} (${fileMeta.totalChunks} 个分片) -> ${mergedPath}`,
      );
    }

    return { success: true, files: mergedFiles };
  }

  /**
   * 完整文件处理流程
   * 合并文件 → 逐个上传阿里云 → 逐个 qwen-long 提取 → 生成 Temp_ID → 缓存数据 → 返回 tempId
   * @param uploadId 上传批次 ID
   * @returns tempId 临时唯一标识符
   */
  async processFiles(
    uploadId: string,
    companyName?: string,
    taxNo?: string,
    hasFiles?: boolean,
  ): Promise<string> {
    let templateContent = '';
    const dataContents: DataContentItem[] = [];

    // 有文件时才走合并 + 提取流程
    if (hasFiles !== false) {
      // 1. 合并文件
      const mergeResult = await this.mergeChunks(uploadId);

      if (!mergeResult.success || !mergeResult.files) {
        throw new Error(
          `文件合并失败: uploadId=${uploadId}, missingChunks=${mergeResult.missingChunks?.join(', ') ?? 'unknown'}`,
        );
      }

      this.logger.log(
        `文件合并完成, uploadId=${uploadId}, 正在处理 ${mergeResult.files.length} 个文件`,
      );

      // 2. 逐个上传阿里云 + qwen-long 提取
      for (const file of mergeResult.files) {
        // 上传到阿里云
        const fileId = await this.aliyunFileService.uploadFile(
          file.filePath,
          file.fileName,
        );

        // qwen-long 提取内容
        const content = await this.qwenLongService.extractContent(fileId);

        // 区分 template 和 data 类型
        if (file.fileType === 'template') {
          templateContent = content;
        } else {
          dataContents.push({ fileName: file.fileName, content });
        }
      }
    } else {
      this.logger.log(
        `无文件上传, 仅缓存企业信息: companyName=${companyName}, taxNo=${taxNo}`,
      );
    }

    // 3. 生成 Temp_ID
    const tempId = uuidv4();

    // 4. 缓存数据
    this.cacheManager.set(tempId, {
      templateContent,
      dataContents,
      companyName,
      taxNo,
      createdAt: Date.now(),
      used: false,
    });

    this.logger.log(`文件处理完成: uploadId=${uploadId}, tempId=${tempId}`);

    return tempId;
  }

  /**
   * 异步文件处理流程（自定义报告专用）
   * 同步完成分片合并校验 + 生成 tempId，立即返回
   * 后台异步执行：阿里云上传 → qwen-long 提取 → 缓存数据 → 查询企业报告解读 → 组装报告 → 更新任务状态
   */
  async processFilesAsync(
    uploadId: string,
    companyName?: string,
    taxNo?: string,
    hasFiles?: boolean,
    userContext?: UserContext,
    taskType?: 'customReport' | 'enterpriseTag',
  ): Promise<string> {
    const tempId = uuidv4();

    // 创建任务记录（状态: processing）
    this.reportTaskManager.create(tempId);

    // 异步执行后续处理，不阻塞返回
    this.processFilesInBackground(
      tempId,
      uploadId,
      companyName,
      taxNo,
      hasFiles,
      userContext,
      taskType,
    );

    this.logger.log(`异步任务已创建: uploadId=${uploadId}, tempId=${tempId}`);

    return tempId;
  }

  /**
   * 后台处理文件（不阻塞请求）
   * 逻辑与 custom_report 工具保持一致
   */
  private async processFilesInBackground(
    tempId: string,
    uploadId: string,
    companyName?: string,
    taxNo?: string,
    hasFiles?: boolean,
    userContext?: UserContext,
    taskType?: 'customReport' | 'enterpriseTag',
  ): Promise<void> {
    const totalStart = Date.now();
    try {
      this.logger.log(
        `[异步][阶段0] 开始后台处理, tempId=${tempId}, uploadId=${uploadId}, companyName=${companyName}, taxNo=${taxNo}, hasFiles=${hasFiles}`,
      );

      let templateContent = '';
      const dataContents: DataContentItem[] = [];

      // === 第一步：文件处理（合并 → 阿里云上传 → qwen-long 提取） ===
      const stage1Start = Date.now();
      if (hasFiles !== false) {
        if (false) {
          // dev 环境：使用 mock 数据，跳过阿里云上传和 qwen-long 提取
          this.logger.log(
            `[异步][阶段1][DEV] 使用 mock 数据，跳过文件上传和提取`,
          );
          const { a: mockTemplate, b: mockData } =
            await import('../../../mock/user-temp');
          templateContent = `<template>\n${mockTemplate}\n</template>`;
          const mockParsed = JSON.parse(mockData);
          const mockFormatResult = this.reportFormatterService.formatReport(mockParsed);
          dataContents.push({
            fileName: 'mock-data.json',
            content: `### 以下为企业报告解读参考数据\n<data>\n${mockFormatResult.markdown || mockData}\n</data>`,
          });
        } else {
          this.logger.log(`[异步][阶段1] 开始合并文件, uploadId=${uploadId}`);
          const mergeStart = Date.now();
          const mergeResult = await this.mergeChunks(uploadId);

          if (!mergeResult.success || !mergeResult.files) {
            throw new Error(
              `文件合并失败: uploadId=${uploadId}, missingChunks=${mergeResult.missingChunks?.join(', ') ?? 'unknown'}`,
            );
          }

          this.logger.log(
            `[异步][阶段1] 文件合并完成, 耗时=${Date.now() - mergeStart}ms, tempId=${tempId}, 文件数=${mergeResult.files.length}, 文件列表=${mergeResult.files.map((f) => f.fileName).join(', ')}`,
          );

          // 并发上传+提取，最多同时 4 个
          const concurrency = 4;
          const tasks = mergeResult.files.map((file) => async () => {
            this.logger.log(
              `[异步][阶段1] 开始上传阿里云: ${file.fileName}, fileType=${file.fileType}`,
            );
            const uploadStart = Date.now();
            const fileId = await this.aliyunFileService.uploadFile(
              file.filePath,
              file.fileName,
            );
            this.logger.log(
              `[异步][阶段1] 阿里云上传完成: ${file.fileName}, fileId=${fileId}, 耗时=${Date.now() - uploadStart}ms`,
            );

            this.logger.log(
              `[异步][阶段1] 开始 qwen-long 提取: ${file.fileName}`,
            );
            const extractStart = Date.now();
            const content = await this.qwenLongService.extractContent(fileId);
            this.logger.log(
              `[异步][阶段1] qwen-long 提取完成: ${file.fileName}, 耗时=${Date.now() - extractStart}ms, 内容:\n${content}`,
            );

            return {
              fileName: file.fileName,
              fileType: file.fileType,
              content,
            };
          });

          const results: {
            fileName: string;
            fileType: string;
            content: string;
          }[] = [];
          for (let i = 0; i < tasks.length; i += concurrency) {
            const batch = tasks.slice(i, i + concurrency);
            const batchResults = await Promise.all(batch.map((fn) => fn()));
            results.push(...batchResults);
          }

          for (const r of results) {
            if (r.fileType === 'template') {
              templateContent = r.content;
            } else {
              dataContents.push({ fileName: r.fileName, content: r.content });
            }
          }
        }
      } else {
        this.logger.log(`[异步][阶段1] 无文件上传，跳过文件处理`);
      }
      this.logger.log(`[异步][阶段1] 总耗时=${Date.now() - stage1Start}ms`);

      // 缓存数据
      this.logger.log(`[异步][阶段1.5] 缓存数据, tempId=${tempId}`);
      this.cacheManager.set(tempId, {
        templateContent,
        dataContents,
        companyName,
        taxNo,
        createdAt: Date.now(),
        used: false,
      });

      // === 企业标签任务：走独立分支 ===
      if (taskType === 'enterpriseTag') {
        await this.processEnterpriseTagTask(tempId, dataContents, templateContent, userContext, companyName);
        this.logger.log(
          `[异步] 企业标签全流程总耗时=${Date.now() - totalStart}ms, tempId=${tempId}`,
        );
        return;
      }

      // === 第二步：数据补充（企业搜索 + 报告解读数据） ===
      const stage2Start = Date.now();
      let taxNoVal = taxNo || '';
      let dataSource = '';

      this.logger.log(
        `[异步][阶段2] 开始数据补充, companyName=${companyName}, taxNoVal=${taxNoVal}`,
      );

      // 如果有企业名称但没有税号，通过搜索获取税号
      if (companyName && !taxNoVal && userContext) {
        try {
          this.logger.log(
            `[异步][阶段2] 企业名称有值但无税号，开始搜索企业: ${companyName}`,
          );
          const searchStart = Date.now();
          this.agentApiService.init(
            userContext,
            this.agentConfig.serviceUrl,
            this.agentConfig.dataServiceUrl,
            this.agentConfig.relationshipServiceUrl,
          );
          const searchResult = await this.agentApiService.searchCompany(
            companyName,
            1,
          );
          const companies = searchResult.data?.data;
          if (Array.isArray(companies) && companies.length > 0) {
            taxNoVal = companies[0].credit_no;
            this.logger.log(
              `[异步][阶段2] 企业搜索成功, taxNoVal=${taxNoVal}, 耗时=${Date.now() - searchStart}ms`,
            );
          } else {
            this.logger.log(
              `[异步][阶段2] 企业搜索无结果, 耗时=${Date.now() - searchStart}ms`,
            );
          }
        } catch (e: any) {
          this.logger.error(`[异步][阶段2] 企业搜索失败: ${e.message}`);
        }
      }

      // 企业报告解读数据查询
      if (taxNoVal && userContext) {
        try {
          this.logger.log(
            `[异步][阶段2] 开始查询报告解读数据, taxNoVal=${taxNoVal}`,
          );
          const interpretStart = Date.now();
          this.agentApiService.init(
            userContext,
            this.agentConfig.serviceUrl,
            this.agentConfig.dataServiceUrl,
            this.agentConfig.relationshipServiceUrl,
          );
          const reportResponse =
            await this.agentApiService.queryReportInterpret(taxNoVal);
          if (reportResponse?.data) {
            const interpretData = reportResponse.data;
            const formatResult = this.reportFormatterService.formatReport(interpretData);
            let referenceData: string;
            if (formatResult.markdown) {
              referenceData = `### 以下为企业报告解读参考数据\n${formatResult.markdown}`;
            } else {
              this.logger.warn(`[异步][阶段2] 报告格式化失败: ${formatResult.error}, 回退为 JSON`);
              referenceData = `### 以下为企业报告解读参考数据\n${JSON.stringify(interpretData)}`;
            }
            this.logger.log(
              `[异步][阶段2] 报告解读数据获取成功, 耗时=${Date.now() - interpretStart}ms, 数据长度=${referenceData.length}`,
            );
            dataContents.push({
              fileName: '系统查询-企业报告解读数据',
              content: referenceData,
            });
            dataSource =
              dataContents.length > 1
                ? '上传数据 + 报告解读数据'
                : '报告解读数据';
          } else {
            this.logger.log(
              `[异步][阶段2] 报告解读数据为空, 耗时=${Date.now() - interpretStart}ms`,
            );
          }
        } catch (e: any) {
          this.logger.error(
            `[异步][阶段2] queryReportInterpret 失败: ${e.message}`,
          );
        }
      } else {
        this.logger.log(
          `[异步][阶段2] 跳过报告解读查询 (taxNoVal=${taxNoVal}, hasUserContext=${!!userContext})`,
        );
      }

      if (!dataSource) {
        dataSource = '上传数据';
      }

      this.logger.log(
        `[异步][阶段2] 数据补充完成, 耗时=${Date.now() - stage2Start}ms, dataSource=${dataSource}`,
      );

      // 参数不足检查：数据是必须的
      if (dataContents.length === 0) {
        throw new Error('请提供数据文件，以便根据模板生成填写参照表');
      }

      // === 第三步：调用 LLM 生成填写参照表 ===
      const stage3Start = Date.now();
      const usePresetTemplate = !templateContent;
      let llmPrompt: string;
      this.logger.log(
        `[异步][阶段3] templateContent长度=${templateContent.length}, dataContents数量=${dataContents.length}, dataSource=${dataSource}, companyName=${companyName}`,
      );
      this.logger.log(`[异步][阶段3] templateContent:\n${templateContent}`);
      this.logger.log(
        `[异步][阶段3] dataContents:\n${dataContents.map((d) => `[${d.fileName}] ${d.content}`).join('\n---\n')}`,
      );

      if (usePresetTemplate) {
        // 用户未上传模板，使用预定义模板，让 LLM 自动选择并填充
        this.logger.log(
          `[异步][阶段3] 用户未上传模板，使用预定义模板自动选择模式, tempId=${tempId}`,
        );
        llmPrompt = this.buildAutoSelectTemplatePrompt(
          dataContents,
          dataSource,
          companyName,
        );
      } else {
        // 用户上传了模板，走原有逻辑
        llmPrompt = this.buildLLMPrompt(
          templateContent,
          dataContents,
          dataSource,
          companyName,
        );
      }
      this.logger.log(
        `[异步][阶段3] 开始调用 LLM 生成${usePresetTemplate ? '自动报告' : '填写参照表'}, tempId=${tempId}, prompt=${llmPrompt}`,
      );

      const llm = new ChatOpenAI({
        modelName: 'qwen3-max-2026-01-23',
        apiKey: this.agentConfig.apiKey,
        configuration: { baseURL: this.agentConfig.baseURL },
        temperature: 0.3,
        maxTokens: 50000,
      });

      const response = await llm.invoke([new HumanMessage(llmPrompt)]);
      const reportContent =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      this.logger.log(
        `[异步][阶段3] LLM 生成完成, 耗时=${Date.now() - stage3Start}ms, tempId=${tempId}, 内容:\n${reportContent}`,
      );

      // === 第四步：生成 Word 文档 ===
      const stage4Start = Date.now();
      this.logger.log(`[异步][阶段4] 开始生成 Word 文档, tempId=${tempId}`);
      const docxFileName = `report_${tempId}`;
      const { docxPath, htmlContent } = await this.docxService.generateDocx(
        reportContent,
        docxFileName,
      );

      // 更新任务状态为成功，存储 docx 文件路径和 HTML 预览内容
      this.reportTaskManager.setSuccess(tempId, docxPath, htmlContent);

      this.logger.log(
        `[异步][阶段4] 文档生成完成, 耗时=${Date.now() - stage4Start}ms, tempId=${tempId}, docx=${docxPath}`,
      );
      this.logger.log(
        `[异步] 全流程总耗时=${Date.now() - totalStart}ms, tempId=${tempId}`,
      );
    } catch (err: any) {
      const errorMsg = err?.message || '参照表生成失败';
      this.reportTaskManager.setFailed(tempId, errorMsg);
      this.logger.error(
        `[异步] 参照表生成失败: tempId=${tempId}, 总耗时=${Date.now() - totalStart}ms, 原因: ${errorMsg}`,
      );
    }
  }

  /**
   * 企业标签任务处理
   * 1. 用 LLM 从提取内容中解析企业名称 JSON 数组
   * 2. 每 10 个并发调 searchEnterpriseByName 获取税号
   * 3. 每 10 个一组调 queryEnterpriseDetail 获取标签
   * 4. 拼接 【企业名称】标签1,标签2,... 格式文本
   * 5. 生成 Word 文档
   */
  private async processEnterpriseTagTask(
    tempId: string,
    dataContents: DataContentItem[],
    templateContent: string,
    userContext?: UserContext,
    companyName?: string,
  ): Promise<void> {
    // === 步骤1：用 LLM 从文件内容中提取企业名称数组 ===
    const stage1Start = Date.now();
    this.logger.log(`[企业标签][步骤1] 开始提取企业名称, tempId=${tempId}, companyName=${companyName}`);

    const allContent = [templateContent, ...dataContents.map((d) => d.content)]
      .filter(Boolean)
      .join('\n');

    this.logger.log(`[企业标签][步骤1] 文件内容长度=${allContent.length}, templateContent长度=${templateContent.length}, dataContents数量=${dataContents.length}`);

    let enterpriseNames: string[] = [];

    // 有文件内容时才调 LLM 提取
    if (allContent.trim()) {
      const llm = new ChatOpenAI({
        modelName: 'qwen3-max-2026-01-23',
        apiKey: this.agentConfig.apiKey,
        configuration: { baseURL: this.agentConfig.baseURL },
        temperature: 0,
        maxTokens: 10000,
      });

      const extractPrompt = `从以下文本中提取所有企业名称，输出为 JSON 数组格式。
要求：
1. 只输出 JSON 数组，不要其他内容，不要 markdown 代码块
2. 数组元素为企业全称字符串
3. 去重
4. 如果没有找到企业名称，输出空数组 []

文本内容：
${allContent}`;

      this.logger.log(`[企业标签][步骤1] LLM prompt长度=${extractPrompt.length}`);

      const extractResponse = await llm.invoke([new HumanMessage(extractPrompt)]);
      const extractText =
        typeof extractResponse.content === 'string'
          ? extractResponse.content
          : JSON.stringify(extractResponse.content);

      this.logger.log(`[企业标签][步骤1] LLM 原始输出: ${extractText}`);

      try {
        const cleaned = extractText.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          enterpriseNames = parsed.filter((n) => typeof n === 'string' && n.trim());
        }
        this.logger.log(`[企业标签][步骤1] LLM 提取到 ${enterpriseNames.length} 个企业: ${JSON.stringify(enterpriseNames)}`);
      } catch (e: any) {
        this.logger.warn(`[企业标签][步骤1] LLM 提取解析失败: ${e.message}, 原始输出: ${extractText}`);
      }
    } else {
      this.logger.log(`[企业标签][步骤1] 无文件内容，跳过 LLM 提取`);
    }

    // 合并用户手动选择的企业名称（去重）
    if (companyName?.trim()) {
      const manualName = companyName.trim();
      if (!enterpriseNames.includes(manualName)) {
        enterpriseNames.unshift(manualName);
        this.logger.log(`[企业标签][步骤1] 合并用户手动选择的企业: ${manualName}`);
      } else {
        this.logger.log(`[企业标签][步骤1] 用户手动选择的企业已存在于提取结果中: ${manualName}`);
      }
    }

    this.logger.log(
      `[企业标签][步骤1] 最终企业名称 ${enterpriseNames.length} 个: ${JSON.stringify(enterpriseNames)}, 耗时=${Date.now() - stage1Start}ms`,
    );

    if (enterpriseNames.length === 0) {
      throw new Error('未从上传文件中提取到任何企业名称，也未手动选择企业，请检查');
    }

    if (enterpriseNames.length > 100) {
      throw new Error('企业名称数量不能超过 100 个，请检查文件内容或手动选择企业');
    }

    // === 步骤2：批量搜索企业获取税号（10 并发） ===
    const stage2Start = Date.now();
    this.logger.log(`[企业标签][步骤2] 开始批量搜索税号, 共 ${enterpriseNames.length} 个企业`);

    if (userContext) {
      this.agentApiService.init(
        userContext,
        this.agentConfig.serviceUrl,
        this.agentConfig.dataServiceUrl,
        this.agentConfig.relationshipServiceUrl,
      );
    }

    const CONCURRENCY = 10;
    const enterpriseWithTaxNo: Array<{ name: string; creditNo: string }> = [];

    for (let i = 0; i < enterpriseNames.length; i += CONCURRENCY) {
      const batch = enterpriseNames.slice(i, i + CONCURRENCY);
      this.logger.log(`[企业标签][步骤2] 处理第 ${i / CONCURRENCY + 1} 批, 企业: ${JSON.stringify(batch)}`);
      const batchStart = Date.now();

      const results = await Promise.allSettled(
        batch.map(async (name) => {
          const result = await this.agentApiService.searchEnterpriseByName(name);
          return { name, result };
        }),
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.result.success && r.value.result.creditNo) {
          enterpriseWithTaxNo.push({
            name: r.value.result.matchedName || r.value.name,
            creditNo: r.value.result.creditNo,
          });
          this.logger.log(`[企业标签][步骤2] 搜索成功: ${r.value.name} -> 税号=${r.value.result.creditNo}, 匹配名称=${r.value.result.matchedName}`);
        } else {
          const failedName = r.status === 'fulfilled' ? r.value.name : '未知';
          const errorMsg = r.status === 'fulfilled' ? r.value.result.errorMessage : (r as PromiseRejectedResult).reason?.message;
          this.logger.warn(`[企业标签][步骤2] 企业搜索失败: ${failedName}, 原因: ${errorMsg}`);
        }
      }

      this.logger.log(`[企业标签][步骤2] 第 ${i / CONCURRENCY + 1} 批完成, 耗时=${Date.now() - batchStart}ms`);
    }

    this.logger.log(
      `[企业标签][步骤2] 税号搜索完成, 成功 ${enterpriseWithTaxNo.length}/${enterpriseNames.length}, 结果: ${JSON.stringify(enterpriseWithTaxNo)}, 总耗时=${Date.now() - stage2Start}ms`,
    );

    if (enterpriseWithTaxNo.length === 0) {
      throw new Error('所有企业名称均未搜索到税号，请检查企业名称是否正确');
    }

    // === 步骤3：批量查询企业标签（10 个一组） ===
    const stage3Start = Date.now();
    this.logger.log(`[企业标签][步骤3] 开始批量查询标签, 共 ${enterpriseWithTaxNo.length} 个企业`);

    // 构建税号→企业名称映射，用于兜底
    const taxNoToNameMap = new Map<string, string>();
    for (const e of enterpriseWithTaxNo) {
      taxNoToNameMap.set(e.creditNo, e.name);
    }

    const tagResults: Array<{ name: string; tags: string[] }> = [];

    for (let i = 0; i < enterpriseWithTaxNo.length; i += CONCURRENCY) {
      const batch = enterpriseWithTaxNo.slice(i, i + CONCURRENCY);
      const batchIds = batch.map((e) => e.creditNo);
      this.logger.log(`[企业标签][步骤3] 处理第 ${i / CONCURRENCY + 1} 批, 税号: ${JSON.stringify(batchIds)}`);
      const batchStart = Date.now();

      try {
        const detailResult = await this.agentApiService.queryEnterpriseDetail(batchIds);
        this.logger.log(`[企业标签][步骤3] 第 ${i / CONCURRENCY + 1} 批查询结果: success=${detailResult.success}, 数据条数=${detailResult.data?.length ?? 0}`);

        if (detailResult.success && detailResult.data) {
          for (const item of detailResult.data) {
            // 企业名称兜底：接口返回为空时用步骤2的搜索结果
            const name = item.enterpriseName || taxNoToNameMap.get(item.enterpriseId) || item.enterpriseId;
            tagResults.push({
              name,
              tags: item.tags.length > 0 ? item.tags : ['暂无标签'],
            });
            this.logger.log(`[企业标签][步骤3] ${name}: 标签=[${item.tags.join('，')}]`);
          }
        } else {
          this.logger.warn(`[企业标签][步骤3] 第 ${i / CONCURRENCY + 1} 批查询失败: ${detailResult.errorMessage}`);
          for (const e of batch) {
            tagResults.push({ name: e.name, tags: ['查询失败'] });
          }
        }
      } catch (e: any) {
        this.logger.error(`[企业标签][步骤3] 第 ${i / CONCURRENCY + 1} 批查询异常: ${e.message}`);
        for (const ent of batch) {
          tagResults.push({ name: ent.name, tags: ['查询异常'] });
        }
      }

      this.logger.log(`[企业标签][步骤3] 第 ${i / CONCURRENCY + 1} 批完成, 耗时=${Date.now() - batchStart}ms`);
    }

    this.logger.log(
      `[企业标签][步骤3] 标签查询完成, 共 ${tagResults.length} 条结果, 总耗时=${Date.now() - stage3Start}ms`,
    );

    // === 步骤4：拼接结果文本并生成 Word ===
    const stage4Start = Date.now();
    this.logger.log(`[企业标签][步骤4] 开始生成文档, tempId=${tempId}, 共 ${tagResults.length} 条标签结果`);

    const lines = tagResults.map(
      (item) => `| ${item.name} | ${item.tags.join('，')} |`,
    );
    const reportContent = `# 企业标签查询结果\n\n| 企业名称 | 标签 |\n| --- | --- |\n${lines.join('\n')}`;

    this.logger.log(`[企业标签][步骤4] 报告内容:\n${reportContent}`);

    const docxFileName = `enterprise_tag_${tempId}`;
    const { docxPath, htmlContent } = await this.docxService.generateDocx(
      reportContent,
      docxFileName,
    );

    this.reportTaskManager.setSuccess(tempId, docxPath, htmlContent);

    this.logger.log(
      `[企业标签][步骤4] 文档生成完成, docxPath=${docxPath}, htmlContent长度=${htmlContent.length}, 耗时=${Date.now() - stage4Start}ms, tempId=${tempId}`,
    );
  }

  /**
   * 构建 LLM prompt，让模型根据模板和数据生成填写参照表
   * 用户拿到参照表后可以直观地知道模板中哪些部分能填、该填什么
   */
  private buildLLMPrompt(
      template: string,
      dataContents: DataContentItem[],
      dataSource: string,
      companyName?: string,
    ): string {
      let prompt = `你是一个专业的企业授信报告数据整理助手。用户上传了报告模板和数据文件。

  ## 核心任务
  逐一分析模板中的每个问题/字段，从数据文件中查找语义上对应的答案并填充。

  ## 输出格式（逐条罗列）
  - 【问题/字段名】：答案

  所有内容统一使用列表的方式以自然语言进行表述，禁止使用 markdown 表格。

  ## 匹配规则
  1. 模板仅用于提取问题/字段结构，不能作为数据源，答案只能来自数据文件
  2. 答案直接引用数据原文，不要编造
  3. **语义匹配**：模板字段和数据字段的名称可能不同，请根据语义进行匹配。例如：
     - 模板中的"下游客户名称" 对应数据中的"前十大客户"
     - 模板中的"上游客户名称" 对应数据中的"前十大供应商"
     - 模板中的"主营板块所属行业/收入结构表" 对应数据中的"开票金额"、"营业收入"等
     - 模板中的"企业产品/服务名称" 对应数据中的"所属行业"、"经营范围"
     - 模板中的"企业近三年财务报表" 对应数据中的"财务情况"
     - 模板中的"纳税申报表" 对应数据中的"已缴税额"、"增值税税负率"
     - 模板中的"实际控制人基本情况" 对应数据中的"法定代表人"等基本信息
  4. 模板中已有的示例数据（如姓名、身份证号等）属于模板样例，应使用数据文件中的实际数据替换
  5. 在数据文件中确实找不到任何可对应信息的字段，标注"暂无数据"
  6. 对于模板中的纯说明性文字（如"注：所有纸质的资料都需要盖公章"），直接跳过不展示
  7. **禁止暴露数据引用**：输出内容中不得出现原始数据字段名、系统变量名或技术标识（如 keyCustomerLoss=是、transactionAmountConcentration=是、mainBusinessException=是 等），应将数据含义转化为自然语言描述
  8. **禁止显示数据来源**：输出内容中不得标注数据来自哪个文件或哪个数据源，不要出现类似"来源：xxx文件"、"数据来源：xxx"等字样
  `;

      if (companyName) {
        prompt += `\n企业名称：${companyName}\n`;
      }

      prompt += `\n## 报告模板\n<template>\n${template}\n</template>\n`;
      prompt += `\n## 数据内容（数据来源：${dataSource}）\n`;
      dataContents.forEach((item) => {
        prompt += `### 文件：${item.fileName}\n<data>\n${item.content}\n</data>\n\n`;
      });

      prompt += `\n请根据以上模板和数据，逐条列出每个字段的填充结果。重点关注：基本信息、上下游客户、财务数据、纳税信息、收入结构等可匹配的内容。直接输出，不要废话。`;

      return prompt;
    }


  /**
   * 构建自动选择模板的 prompt
   * 当用户未上传模板时，让 LLM 从预定义模板中选择最合适的，并将数据填充到模板中生成完整报告
   */
  private buildAutoSelectTemplatePrompt(
    dataContents: DataContentItem[],
    dataSource: string,
    companyName?: string,
  ): string {
    let prompt = `你是一个专业的企业报告撰写助手。用户上传了数据文件但没有提供报告模板。

你的任务：
1. 先分析用户上传的数据内容，判断数据更适合哪种报告类型
2. 从以下预定义模板中选择最合适的一个
3. 将数据填充到选中的模板中，生成一份完整的报告
4. 你输出的是一个可用的报告，不要展示你的思考过程和选择过程

## 可选模板

`;

    PRESET_TEMPLATES.forEach((t, index) => {
      prompt += `### 模板${index + 1}：${t.name}\n`;
      prompt += `适用场景：${t.description}\n`;
      prompt += `模板内容：\n<template>\n${t.content}\n</template>\n\n`;
    });

    if (companyName) {
      prompt += `\n企业名称：${companyName}\n`;
    }

    prompt += `\n## 数据内容（数据来源：${dataSource}）\n`;
    dataContents.forEach((item) => {
      prompt += `### 文件：${item.fileName}\n<data>\n${item.content}\n</data>\n\n`;
    });

    prompt += `\n## 输出要求
1. 按照选中模板的结构，将数据填充到对应字段中
2. 有数据支撑的字段，直接引用数据原文填写
3. 数据中找不到对应内容的字段，标注"暂无数据"
4. 输出完整的报告，保持模板的章节结构
5. 直接输出报告内容，不要多余的解释
6. **禁止暴露数据引用**：输出内容中不得出现原始数据字段名、系统变量名或技术标识（如 keyCustomerLoss=是、transactionAmountConcentration=是、mainBusinessException=是 等），应将数据含义转化为自然语言描述`;

    return prompt;
  }

  /**
   * 定时清理未完成的分片上传
   * 每 10 分钟检查一次，清理超过 chunkExpireTime（默认 1 小时）的临时目录
   */
  @Interval(10 * 60 * 1000)
  async cleanupExpiredChunks(): Promise<void> {
    const tempDir = this.uploadConfig.uploadTempDir;

    try {
      await fs.access(tempDir);
    } catch {
      // 临时目录不存在，无需清理
      return;
    }

    const now = Date.now();
    let cleanedCount = 0;

    try {
      const entries = await fs.readdir(tempDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(tempDir, entry.name);

        try {
          const stat = await fs.stat(dirPath);
          const age = now - stat.mtimeMs;

          if (age > this.uploadConfig.chunkExpireTime) {
            await fs.rm(dirPath, { recursive: true, force: true });
            cleanedCount++;
            this.logger.log(
              `已清理过期上传目录: ${entry.name} (存在时间: ${Math.round(age / 60000)}分钟)`,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `检查/清理上传目录失败: ${entry.name}: ${err?.message || err}`,
          );
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`分片清理: 已移除 ${cleanedCount} 个过期上传目录`);
      }
    } catch (err: any) {
      this.logger.error('清理过期分片失败: ' + (err?.message || err));
    }
  }
}
