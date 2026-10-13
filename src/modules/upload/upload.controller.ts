import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  BadRequestException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { LoggerService } from 'src/modules-global/logger/service';
import { UploadService } from './services/upload.service';
import { ReportTaskManager } from './services/report-task-manager.service';
import { AuthCheckerService } from 'src/modules/agent/services/auth-checker.service';
import { ChunkUploadDto } from './dto/chunk-upload.dto';
import { MergeUploadDto } from './dto/merge-upload.dto';
import { SetTimeout } from 'src/decorator';

/**
 * Upload 控制器
 * 处理分片上传和文件合并请求
 */
@Controller('upload')
export class UploadController {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  constructor(
    private readonly uploadService: UploadService,
    private readonly reportTaskManager: ReportTaskManager,
    private readonly authCheckerService: AuthCheckerService,
  ) {}

  /**
   * 分片上传接口
   * 接收单个分片文件及其元数据，存储到临时目录
   */
  @Post('chunk')
  @UseInterceptors(FileInterceptor('file'))
  async uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ChunkUploadDto,
  ) {
    if (!file) {
      throw new BadRequestException('分片文件不能为空');
    }

    await this.uploadService.saveChunk(dto, file);

    return {
      chunkIndex: dto.chunkIndex,
    };
  }

  /**
   * 合并接口
   * 校验分片完整性并合并文件，上传阿里云 + qwen-long 提取 + 缓存，返回 tempId
   */
  @Post('merge')
  @SetTimeout(600000) // 10 分钟，文件提取耗时较长
  async mergeChunks(@Body() dto: MergeUploadDto) {
    const tempId = await this.uploadService.processFiles(
      dto.uploadId,
      dto.companyName,
      dto.taxNo,
      dto.hasFiles,
    );

    return {
      tempId,
    };
  }

  /**
   * 异步合并接口（自定义报告专用）
   * 接收后立即返回 tempId，后台异步处理文件
   * 选择了企业时会先校验授权，未授权返回 auth_required 状态
   */
  @Post('merge-async')
  async mergeChunksAsync(@Body() dto: MergeUploadDto, @Req() req: Request) {
    const session = req.headers.cookie || '';
    const userContext = dto.userInfo
      ? {
          orgNo: dto.userInfo.orgNo,
          orgChannelNo: dto.userInfo.orgChannelNo,
          orgChannelUserId: dto.userInfo.id,
          session,
        }
      : undefined;

    // 选择了企业且未跳过授权检查时，先校验授权
    if (dto.taxNo && dto.companyName && !dto.skipAuth && userContext) {
      const authResult = await this.authCheckerService.checkAuth({
        orgNo: userContext.orgNo,
        corpTaxNo: dto.taxNo,
      });

      if (!authResult.hasAuth) {
        this.logger.log(
          `企业未授权, companyName=${dto.companyName}, taxNo=${dto.taxNo}, 创建授权任务`,
        );

        const { v4: uuidv4 } = await import('uuid');
        const taskId = uuidv4();

        this.authCheckerService.setAuthCacheData(taskId, {
          enterpriseName: dto.companyName,
          orgNo: userContext.orgNo,
          corpTaxNo: dto.taxNo,
          subjectName: dto.companyName,
          originalQuestion: '',
          operatorUserId: dto.userInfo!.id,
          operatorUserName: '',
        });

        return {
          status: 'auth_required',
          taskId,
          enterpriseName: dto.companyName,
          uploadId: dto.uploadId,
        };
      }
    }

    const tempId = await this.uploadService.processFilesAsync(
      dto.uploadId,
      dto.companyName,
      dto.taxNo,
      dto.hasFiles,
      userContext,
      dto.taskType,
    );

    return {
      tempId,
      status: 'processing',
    };
  }

  /**
   * 查询报告任务状态
   */
  @Get('report-status/:tempId')
  async getReportStatus(@Param('tempId') tempId: string) {
    const task = this.reportTaskManager.get(tempId);
    if (!task) {
      return { status: 'not_found', error: '任务不存在或已过期' };
    }
    return task;
  }

  /**
   * 预览报告 HTML 内容
   */
  @Get('report-preview/:tempId')
  async getReportPreview(
    @Param('tempId') tempId: string,
    @Res() res: Response,
  ) {
    const task = this.reportTaskManager.get(tempId);
    if (!task || task.status !== 'success' || !task.htmlContent) {
      throw new NotFoundException('预览不可用');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(task.htmlContent);
  }

  /**
   * 下载报告 Word 文档
   */
  @Get('report-docx/:tempId')
  async getReportDocx(
    @Param('tempId') tempId: string,
    @Res() res: Response,
  ) {
    const task = this.reportTaskManager.get(tempId);
    if (!task || task.status !== 'success' || !task.result) {
      throw new NotFoundException('报告不存在或尚未生成完成');
    }

    const docxPath = task.result;

    if (!fs.existsSync(docxPath)) {
      throw new NotFoundException('Word 文件不存在');
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="report_${tempId}.docx"`);

    const stream = fs.createReadStream(docxPath);
    stream.pipe(res);
  }
}
