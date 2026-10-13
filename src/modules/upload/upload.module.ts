import { Module, forwardRef } from '@nestjs/common';
import { UploadConfig } from './config/upload.config';
import { AliyunFileService } from './services/aliyun-file.service';
import { CacheManager } from './services/cache-manager.service';
import { QwenLongService } from './services/qwen-long.service';
import { ReportTaskManager } from './services/report-task-manager.service';
import { DocxService } from './services/docx.service';
import { UploadService } from './services/upload.service';
import { UploadController } from './upload.controller';
import { AgentModule } from 'src/modules/agent/agent.module';

/**
 * Upload 模块
 * 负责分片上传接收、文件合并、阿里云文件上传及 qwen-long 模型调用
 */
@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [UploadController],
  providers: [UploadConfig, CacheManager, ReportTaskManager, DocxService, UploadService, AliyunFileService, QwenLongService],
  exports: [UploadConfig, CacheManager, ReportTaskManager, DocxService, UploadService, AliyunFileService, QwenLongService],
})
export class UploadModule {}
