import { Module, forwardRef } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AuthController } from './controllers/auth.controller';
import { AgentService } from './agent.service';
import { AgentApiService } from './api.service';
import { AgentConfig } from './config/agent.config';
import { SessionManager } from './session/session.manager';
import { ChatHistoryService } from './chat-history.service';
import { AuthCheckerService } from './services/auth-checker.service';
import { AuthLLMValidatorService } from './services/auth-llm-validator.service';
import { AuthFileUploaderService } from './services/auth-file-uploader.service';
import { ReportFormatterService } from './services/report-formatter.service';
import { UploadModule } from 'src/modules/upload/upload.module';

/**
 * Agent 模块
 * 基于 LangChain 和 LangGraph 的智能对话系统
 * 注意：HttpService 由全局模块 HttpModule 提供，无需在此导入
 */
@Module({
  imports: [forwardRef(() => UploadModule)],
  controllers: [AgentController, AuthController],
  providers: [
    AgentService,
    AgentApiService,
    AgentConfig,
    SessionManager,
    ChatHistoryService,
    AuthCheckerService,
    AuthLLMValidatorService,
    AuthFileUploaderService,
    ReportFormatterService,
  ],
  exports: [AgentService, AgentApiService, AgentConfig, ReportFormatterService, AuthCheckerService],
})
export class AgentModule {}
