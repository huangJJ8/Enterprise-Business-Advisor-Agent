import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Sse,
  Query,
  Get,
} from '@nestjs/common';
import axios from 'axios';
import { AgentService } from './agent.service';
import { Observable } from 'rxjs';
import { SseService } from 'src/modules-global/sse/service';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentChatDto } from './dto/agent.dto';
import { RateLimitKeyEnum } from 'src/types/types';
import { SetTimeout, NoLog, RateLimit } from 'src/decorator';
import { AgentApiService } from './api.service';
import { AgentConfig } from './config/agent.config';
import { ChatHistoryService } from './chat-history.service';
import { AuthCheckerService } from './services/auth-checker.service';
import { HttpService } from 'src/modules-global/http/service';
import { UserInfo } from './types/agent.types';
import {
  getProvinceCode,
  getCityCode,
  getCountyCode,
} from './tools/utils/region-code';
import { isDev } from 'src/config';

/**
 * Agent 控制器
 * 处理 Agent 相关的 HTTP 请求
 */
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly sseService: SseService,
    private readonly logger: LoggerService,
    private readonly agentApiService: AgentApiService,
    private readonly agentConfig: AgentConfig,
    private readonly chatHistoryService: ChatHistoryService,
    private readonly authCheckerService: AuthCheckerService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 处理流式 chunk 的通用方法
   * @param chunks 异步生成器
   * @param sendFn 发送函数
   */
  private async processChunks(
    chunks: AsyncGenerator<any, void, unknown>,
    sendFn: (data: any) => Promise<void> | void,
  ): Promise<void> {
    let buffer = '';
    let fullResponse = '';

    try {
      for await (const chunk of chunks) {
        try {
          // 处理不同类型的 chunk
          if (chunk.type === 'token') {
            // 文本 token，累积后发送
            buffer += chunk.content || '';
            fullResponse += chunk.content || '';

            // 每累积一定长度就发送一次
            if (buffer.length >= 10) {
              await sendFn({ content: buffer, type: chunk.type });
              buffer = '';
            }
          } else if (chunk.type === 'tool') {
            // 工具调用信息
            if (chunk.toolName) {
              const toolInfo = JSON.stringify(chunk);
              this.logger.log(`工具调用: ${toolInfo}`);
              await sendFn({ content: toolInfo, type: chunk.type });
            }
          } else if (chunk.type === 'toolDone') {
            // 错误信息
            await sendFn({ type: chunk.type });
          } else if (chunk.type === 'error') {
            // 错误信息
            await sendFn({ error: chunk.content, type: chunk.type });
          } else if (chunk.type === 'done') {
            // 完成，发送剩余 buffer
            if (buffer) {
              fullResponse += '';
              await sendFn({ content: buffer, type: 'token' });
              buffer = '';
            }
          }
        } catch (chunkError: any) {
          this.logger.error('处理chunk时发生错误:', chunkError.message);
        }
      }
    } catch (streamError: any) {
      this.logger.error('流处理过程中发生错误:', streamError.message);
      await sendFn({
        error: '流处理错误: ' + (streamError.message || '未知错误'),
      });
    }

    // 确保发送剩余内容
    if (buffer) {
      fullResponse += buffer;
      await sendFn({ content: buffer });
    }

    this.logger.log(`模型最终返回结果: ${fullResponse}`);
  }

  /**
   * Agent 聊天接口 (移动端 EventSource)
   * 专门针对移动端使用 new EventSource 方式交互的接口
   */
  @SetTimeout(false)
  @NoLog([false, true])
  @Sse('chatTrue')
  chatTrue(@Res() res: MyRes, @Req() req: MyReq, @Query() query: AgentChatDto) {
    const { prompt, userInfo } = query;

    // 处理自定义报告请求（已改为后台异步处理，不再需要 agent 调用工具）
    let finalPrompt = prompt;
    if (query.customReportId) {
      finalPrompt = `[自定义报告工具指令] reportId=${query.customReportId}\n用户已上传文件，系统正在后台自动生成填写参照表，请告知用户稍候即可下载。\n\n${prompt}`;
      this.logger.log(
        `检测到自定义报告请求, reportId: ${query.customReportId}`,
      );
    }

    /**
     * {
        "id": 167,
        "orgNo": "ORG0000000000000000A",
        "orgChannelNo": "OC000000000000000001",
        "name": "loan-partner2",
        "phone": "138****0001",
        "password": "$2a$10$T9rfxGBCpuERcKlxBb98eeCG2iZiuoSLpXt0zt9V73sE3lrCsb.h2",
        "mail": "user@example.com",
        "roleId": 1,
        "status": "1",
        "userType": "1",
        "sourceType": "1",
        "createTime": null,
        "updateTime": null,
        "labelId": null,
        "dataRoleType": null,
        "channelObjectNo": "U000000000000000000",
        "orgChannelName": "示例银行A采购贷",
        "orgName": "Acme发票机构",
        "isWhiteUser": true,
        "encryptData": "U2FsdGVkX1/MRR/6t04Bo/a7FvGjv4dM9nuP+k1d1JilOLLCElaqkWgDzFpol+Fz1LGpcvavc8bDiK2IFVrhHmMQk9Oxv/f6noFF0flZKmJZN8Ptae9R3eOxY/ZXLXxdjJ2NTE7S4uxcXvhMPiqbEQ==",
        "province": "北京市",
        "city": "北京市",
        "district": "海淀区",
        "globalConversationId": "3782ae68-2b90-46e4-a06a-fee033528504",
        "znyxConversationId": "ed8014a9-386f-4c1d-8329-14da6e8f948f"
    }
     */

    // const session = `session=YOUR_SESSION_COOKIE;`;
    // const orgNo: string = 'ORG0000000000000000A';
    // const orgChannelNo: string = 'OC000000000000000000';
    // const orgChannelUserId: number = 15;

    const userInfoObj = JSON.parse(userInfo);
    this.logger.log('userInfoObj ' + JSON.stringify(userInfoObj));

    const orgNo: string = query.orgNo || userInfoObj.orgNo;
    const orgChannelNo: string = query.orgChannelNo || userInfoObj.orgChannelNo;
    const orgChannelUserId: number = query.orgChannelUserId || userInfoObj.id;
    const session = req.headers.cookie || '';

    const userInfoData: UserInfo = {
      province: userInfoObj.province,
      city: userInfoObj.city,
      district: userInfoObj.district,
      provinceCode: userInfoObj.province
        ? getProvinceCode(userInfoObj.province)
        : undefined,
      cityCode: userInfoObj.city ? getCityCode(userInfoObj.city) : undefined,
      countyCode: userInfoObj.district
        ? getCountyCode(userInfoObj.district)
        : undefined,
      orgNo,
      orgChannelNo,
      id: orgChannelUserId,
      name: userInfoObj.name,
    };

    const contextId = query.contextId;

    let streamNext: (value: unknown) => void = () => {};

    const observableStream = new Observable((observer) => {
      streamNext = observer.next.bind(observer);
    });

    const run = async () => {
      // 使用 contextId 作为会话 ID
      const sessionId = contextId;

      this.logger.log(`Agent chatTrue 请求 - 会话: ${sessionId}`);
      this.logger.log(`用户提示: ${finalPrompt}`);

      try {
        const userContext = {
          orgNo,
          orgChannelNo,
          orgChannelUserId,
          session,
        };

        this.logger.log('userContext ' + JSON.stringify(userContext));
        this.logger.log('prompt ' + finalPrompt);
        this.logger.log('sessionId ' + sessionId);

        // 通过 contextId 获取 historyId
        let historyId: number | undefined;
        try {
          const validation =
            await this.chatHistoryService.validateContext(contextId);
          if (validation.valid && validation.historyId) {
            historyId = validation.historyId;
          }
        } catch (err: any) {
          this.logger.error(
            '校验 contextId 失败，跳过消息持久化:',
            err.message,
          );
        }

        // 在调用 processQuery 之前，保存用户消息
        if (historyId) {
          try {
            await this.chatHistoryService.saveUserMessage(
              historyId,
              finalPrompt,
            );
          } catch (err: any) {
            this.logger.error('保存用户消息失败:', err.message);
          }
        }

        // 处理查询并获取流和停止方法
        const { chunks, chunksStop } = await this.agentService.processQuery(
          sessionId,
          finalPrompt,
          userContext,
          userInfoData,
        );

        // 检测客户端断开连接
        res.on('close', async () => {
          const isClientDisconnect =
            req.socket.destroyed && !req.socket.connecting;

          if (isClientDisconnect) {
            this.logger.log('客户端主动断开连接');
          } else {
            this.logger.log('连接关闭（可能是超时或其他原因）');
          }

          try {
            await chunksStop();
          } catch (error: any) {
            this.logger.error('停止流时发生错误:', error.message);
          }
        });

        // 收集完整的助手回答内容
        let fullAssistantContent = '';

        // 使用通用方法处理 chunks，同时收集完整回答
        await this.processChunks(chunks, (data) => {
          // 收集含有 content 的文本内容用于持久化（包括 token 类型和最后的 buffer 清空）
          if (data.content && !data.error && data.type !== 'tool') {
            fullAssistantContent += data.content;
          }
          streamNext({ done: false, value: data });
        });

        // 流式输出完成后，保存助手回答
        if (historyId && fullAssistantContent) {
          try {
            await this.chatHistoryService.saveAssistantMessage(
              historyId,
              fullAssistantContent,
            );
          } catch (err: any) {
            this.logger.error('保存助手消息失败:', err.message);
          }
        }

        // 添加短暂延迟，确保所有数据都已发送
        await new Promise((resolve) => setTimeout(resolve, 100));

        streamNext({ done: true, data: null });
      } catch (error: any) {
        this.logger.error('Agent chatTrue 错误:', error);
        this.logger.error('错误堆栈:', error.stack);
        streamNext({ error: error.message || '传输错误', done: true });
      }
    };

    run();

    return observableStream;
  }

  /**
   * Agent 聊天接口
   * 支持 SSE 流式响应
   */
  @SetTimeout(false)
  @NoLog([false, true])
  @Post('chat')
  async chat(@Res() res: MyRes, @Req() req: MyReq, @Body() body: AgentChatDto) {
    const sseOptions: SseOptions = {
      dev: true,
    };

    const { done, send } = await this.sseService.createSseRequest(
      res,
      req,
      sseOptions,
    );

    const { prompt, userInfo } = body;
    const session = req.headers.cookie || '';

    const userInfoObj = userInfo ? JSON.parse(userInfo) : {};
    const orgNo: string = body.orgNo || userInfoObj.orgNo;
    const orgChannelNo: string = body.orgChannelNo || userInfoObj.orgChannelNo;
    const orgChannelUserId: number = body.orgChannelUserId || userInfoObj.id;

    const userInfoData: UserInfo = {
      province: userInfoObj.province,
      city: userInfoObj.city,
      district: userInfoObj.district,
      provinceCode: userInfoObj.province
        ? getProvinceCode(userInfoObj.province)
        : undefined,
      cityCode: userInfoObj.city ? getCityCode(userInfoObj.city) : undefined,
      countyCode: userInfoObj.district
        ? getCountyCode(userInfoObj.district)
        : undefined,
      orgNo,
      orgChannelNo,
      id: orgChannelUserId,
      name: userInfoObj.name,
    };

    const sessionId = `${orgChannelUserId}_${Date.now()}`;

    this.logger.log(`Agent chat 请求 - 会话: ${sessionId}`);
    this.logger.log(`用户提示: ${prompt}`);

    let chunksStop: (() => Promise<void>) | undefined;

    try {
      const userContext = {
        orgNo,
        orgChannelNo,
        orgChannelUserId,
        session,
      };

      // 处理查询并获取流和停止方法
      const result = await this.agentService.processQuery(
        sessionId,
        prompt,
        userContext,
        userInfoData,
      );

      const { chunks } = result;
      chunksStop = result.chunksStop;

      // 设置连接关闭回调
      sseOptions.close = async ({ type }) => {
        this.logger.log(`断开连接，type: ${type}`);
        try {
          if (chunksStop) {
            await chunksStop();
          }
        } catch (error: any) {
          this.logger.error('关闭流时发生错误:', error.message);
        }
      };

      // 使用通用方法处理 chunks
      await this.processChunks(chunks, send);

      await done();
    } catch (error: any) {
      this.logger.error('Agent chat 错误:', error);
      this.logger.error('错误堆栈:', error.stack);

      // 确保在发生错误时也能正确关闭流
      if (chunksStop) {
        try {
          await chunksStop();
        } catch (stopError: any) {
          this.logger.error('停止流时发生错误:', stopError.message);
        }
      }

      try {
        await send({
          error: error.message || '服务器内部错误',
        });
        await done();
      } catch (sendError: any) {
        this.logger.error('发送错误响应时失败:', sendError.message);
      }
    }
  }

  /**
   * 获取会话统计信息
   */
  @Post('stats')
  async getStats() {
    return this.agentService.getSessionStats();
  }

  /**
   * 生成报告接口
   * 前端调用此接口，由 agent 服务转发到 saasCheck 服务
   */
  @Post('createReport')
  async createReport(@Body() body: { taxNo: string; userId: string }) {
    try {
      this.logger.log(
        `生成报告请求: taxNo=${body.taxNo}, userId=${body.userId}`,
      );
      const result = await this.agentService.createReport(
        body.taxNo,
        body.userId,
      );
      return result;
    } catch (error: any) {
      this.logger.error('生成报告失败:', error.message);
      return { status: 500, message: error.message || '生成报告失败' };
    }
  }

  /**
   * 企业模糊搜索接口
   * 根据关键词联想匹配企业名称
   */
  @Get('companySearch')
  async companySearch(
    @Query('searchkey') searchkey: string,
    @Query('count') count?: number,
  ) {
    try {
      this.logger.log(`企业模糊搜索: searchkey=${searchkey}`);
      // 直接使用 dataServiceUrl 调用第三方接口
      const result = await this.agentApiService.searchCompany(
        searchkey,
        count || 5,
      );
      const data = result?.data;
      if (data?.returnCode === '200') {
        return { status: 200, data: data.data, message: '成功' };
      }
      return {
        status: 200,
        data: data?.data || [],
        message: data?.returnMessage || '查询完成',
      };
    } catch (error: any) {
      this.logger.error('企业模糊搜索失败:', error.message);
      return { status: 500, data: [], message: error.message || '搜索失败' };
    }
  }

  /**
   * PDF 预览/下载代理接口
   * 请求 saasCheck 的下载接口拿到 PDF 流，设置正确的 Content-Type 返回给前端
   * - 默认 inline 模式（浏览器内预览）
   * - 传 download=1 时触发下载
   */
  @Get('pdfPreview')
  async pdfPreview(
    @Query('reportFile') reportFile: string,
    @Query('userId') userId: string,
    @Query('taxNo') taxNo: string,
    @Query('download') download: string,
    @Res() res: MyRes,
  ) {
    try {
      if (!reportFile || !userId || !taxNo) {
        res
          .status(400)
          .json({ message: '缺少必要参数 reportFile / userId / taxNo' });
        return;
      }

      const saasCheckUrl = this.agentConfig.saasCheckUrl;
      const downloadUrl = `${saasCheckUrl}/creditapi/report/downloadbyuserid`;

      this.logger.log(
        `PDF代理请求: reportFile=${reportFile}, userId=${userId}, taxNo=${taxNo}`,
      );

      const response = await axios.get(downloadUrl, {
        params: { reportFile, userId, taxNo },
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      // 校验上游返回的数据是否为有效 PDF（PDF 文件以 %PDF 开头）
      const buffer = Buffer.from(response.data);
      const header = buffer.slice(0, 4).toString('ascii');
      if (header !== '%PDF') {
        const bodyText = buffer.toString('utf-8').slice(0, 500);
        this.logger.error(
          `上游返回非PDF数据, header="${header}", body=${bodyText}`,
        );
        res
          .status(502)
          .json({ message: '上游返回的不是有效PDF文件', upstream: bodyText });
        return;
      }

      const disposition = download === '1' ? 'attachment' : 'inline';
      const filename = reportFile.endsWith('.pdf')
        ? reportFile
        : `${reportFile}.pdf`;

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': response.data.length,
      });

      res.send(response.data);
    } catch (error: any) {
      this.logger.error('PDF代理请求失败:', error.message);
      res.status(502).json({ message: 'PDF文件获取失败: ' + error.message });
    }
  }

  /**
   * 创建新对话
   * 接收 userId，返回 contextId 和 historyId
   */
  @Post('createChat')
  async createChat(@Body() body: { userId: number }) {
    const { userId } = body;
    if (!userId) {
      return { status: 400, message: '缺少必要参数 userId' };
    }
    try {
      const result = await this.chatHistoryService.createChat(userId);
      return { status: 200, ...result };
    } catch (error: any) {
      this.logger.error('创建对话失败:', error.message);
      return { status: 500, message: error.message || '创建对话失败' };
    }
  }

  /**
   * 校验 contextId 是否有效
   */
  @Get('validateContext')
  async validateContext(@Query('contextId') contextId: string) {
    if (!contextId) {
      return { status: 400, message: '缺少必要参数 contextId' };
    }
    try {
      const result = await this.chatHistoryService.validateContext(contextId);
      return { status: 200, ...result };
    } catch (error: any) {
      this.logger.error('校验 contextId 失败:', error.message);
      return { status: 500, message: error.message || '校验失败' };
    }
  }

  /**
   * 获取某会话的所有消息
   */
  @Get('messages')
  async getMessages(@Query('contextId') contextId: string) {
    if (!contextId) {
      return { status: 400, message: '缺少必要参数 contextId' };
    }
    try {
      const messages = await this.chatHistoryService.getMessages(contextId);
      return { status: 200, messages };
    } catch (error: any) {
      this.logger.error('获取消息列表失败:', error.message);
      return { status: 500, message: error.message || '获取消息失败' };
    }
  }

  /**
   * 获取用户的历史会话列表
   */
  @Get('chatList')
  async getChatList(@Query('userId') userId: string) {
    if (!userId) {
      return { status: 400, message: '缺少必要参数 userId' };
    }
    try {
      const list = await this.chatHistoryService.getChatList(Number(userId));
      return { status: 200, list };
    } catch (error: any) {
      this.logger.error('获取会话列表失败:', error.message);
      return { status: 500, message: error.message || '获取会话列表失败' };
    }
  }

  /**
   * 获取企业详情（工商信息 + 标签）
   * 前端 Top20 卡片点击时直接调用，不走 AI 对话流
   */
  @Get('enterpriseDetail')
  async getEnterpriseDetail(
    @Query('taxNo') taxNo: string,
    @Query('enterpriseName') enterpriseName: string,
    @Req() req: MyReq,
  ) {
    if (!taxNo || !enterpriseName) {
      return {
        status: 400,
        success: false,
        message: '缺少必要参数 taxNo 或 enterpriseName',
      };
    }

    try {
      this.logger.log(
        `查询企业详情: taxNo=${taxNo}, enterpriseName=${enterpriseName}`,
      );

      // 初始化 apiService（需要 serviceUrl 和 relationshipServiceUrl）
      const session = req.headers.cookie || '';
      this.agentApiService.init(
        { orgNo: '', orgChannelNo: '', orgChannelUserId: 0, session },
        this.agentConfig.serviceUrl,
        this.agentConfig.dataServiceUrl,
        this.agentConfig.relationshipServiceUrl,
      );

      // 并行查询工商信息和企业画像标签
      const [bizResult, detailResult] = await Promise.all([
        this.agentApiService.getBasicInformation(taxNo),
        this.agentApiService.queryEnterpriseDetail([taxNo]),
      ]);

      const bizData = bizResult?.data?.data || null;
      const first = detailResult?.success && detailResult.data?.length ? detailResult.data[0] : null;
      const tags = first?.tags || {};

      return {
        status: 200,
        success: true,
        data: {
          tags,
          companyInfo: bizData?.companyInfo || null,
          employeeList: bizData?.employees || [],
          partnerList: bizData?.partners || [],
          changeRecordList: bizData?.changeRecords || [],
        },
      };
    } catch (error: any) {
      this.logger.error('查询企业详情失败:', error.message);
      return {
        status: 500,
        success: false,
        message: error.message || '查询失败',
      };
    }
  }

  /**
   * 企业鉴权检查
   * 检查当前用户对目标企业是否有有效授权
   */
  @Get('enterprise/authCheck')
  async enterpriseAuthCheck(
    @Query('taxNo') taxNo: string,
    @Query('enterpriseName') enterpriseName: string,
    @Req() req: MyReq,
  ) {
    if (!taxNo || !enterpriseName) {
      return {
        status: 400,
        success: false,
        message: '缺少必要参数 taxNo 或 enterpriseName',
      };
    }

    try {
      // 从请求中获取用户信息
      const userInfoStr = req.query?.userInfo as string;
      let orgNo = '';
      if (userInfoStr) {
        try {
          const userInfo = JSON.parse(userInfoStr);
          orgNo = userInfo.orgNo || '';
        } catch {}
      }

      const result = await this.authCheckerService.checkAuth({
        orgNo,
        corpTaxNo: taxNo,
      });

      return {
        status: 200,
        success: true,
        data: {
          hasAuth: result.hasAuth,
          errorMessage: result.errorMessage,
        },
      };
    } catch (error: any) {
      this.logger.error('企业鉴权检查失败:', error.message);
      return {
        status: 500,
        success: false,
        message: error.message || '鉴权检查失败',
      };
    }
  }

  /**
   * 创建授权任务（前端主动发起，不依赖对话流程）
   * 生成 taskId 并缓存授权上下文，供后续 auth/submit 使用
   */
  @Post('enterprise/createAuthTask')
  async createAuthTask(
    @Body()
    body: {
      taxNo: string;
      enterpriseName: string;
      orgNo?: string;
      operatorUserId?: number;
      operatorUserName?: string;
    },
  ) {
    const { taxNo, enterpriseName, orgNo, operatorUserId, operatorUserName } =
      body;

    if (!taxNo || !enterpriseName) {
      return {
        status: 400,
        success: false,
        message: '缺少必要参数 taxNo 或 enterpriseName',
      };
    }

    try {
      const { v4: uuidv4 } = await import('uuid');
      const taskId = uuidv4();

      // 使用 AuthCheckerService 的缓存机制存储授权上下文
      const cacheData = {
        enterpriseName,
        orgNo: orgNo || '',
        corpTaxNo: taxNo,
        subjectName: enterpriseName,
        originalQuestion: '',
        operatorUserId: operatorUserId || 0,
        operatorUserName: operatorUserName || '',
      };

      // 直接调用 cacheService 存储（复用 auth: 前缀，与 AuthController 兼容）
      this.authCheckerService.setAuthCacheData(taskId, cacheData);

      this.logger.log(
        `前端主动创建授权任务, taskId: ${taskId}, 企业: ${enterpriseName}`,
      );

      return {
        status: 200,
        success: true,
        data: { taskId, enterpriseName },
      };
    } catch (error: any) {
      this.logger.error('创建授权任务失败:', error.message);
      return {
        status: 500,
        success: false,
        message: error.message || '创建授权任务失败',
      };
    }
  }

  /**
   * 带授权校验的 saas 报表查询通用方法（供 controller 接口使用）
   */
  private async queryAuthedSaasReport(
    taxNo: string,
    userInfoStr: string,
    reportPath: string,
    label: string,
  ) {
    if (!taxNo) {
      return { status: 400, success: false, message: '缺少必要参数 taxNo' };
    }

    try {
      let orgNo = '';
      if (userInfoStr) {
        try {
          const userInfo = JSON.parse(userInfoStr);
          orgNo = userInfo.orgNo || '';
        } catch {}
      }

      const authResult = await this.authCheckerService.checkAuth({
        orgNo,
        corpTaxNo: taxNo,
      });

      if (!authResult.hasAuth) {
        return {
          status: 403,
          success: false,
          message: '未授权，请先完成企业鉴权',
        };
      }

      const result = await this.agentApiService.querySaasReportData(taxNo, reportPath, label);
      if (!result.success) {
        return { status: 500, success: false, message: result.message };
      }
      return { status: 200, success: true, data: result.data };
    } catch (error: any) {
      this.logger.error(`查询${label}失败:`, error.message);
      return {
        status: 500,
        success: false,
        message: error.message || '查询失败',
      };
    }
  }

  /**
   * 经营收入数据（调用 saas 真实接口）
   */
  @Get('enterprise/businessIncome')
  async getBusinessIncome(
    @Query('taxNo') taxNo: string,
    @Query('userInfo') userInfoStr: string,
  ) {
    return this.queryAuthedSaasReport(taxNo, userInfoStr, 'saasSalesReport', '经营收入');
  }

  /**
   * 采购支出数据（真实接口）
   */
  @Get('enterprise/purchaseExpense')
  async getPurchaseExpense(
    @Query('taxNo') taxNo: string,
    @Query('userInfo') userInfoStr: string,
  ) {
    return this.queryAuthedSaasReport(taxNo, userInfoStr, 'saasPurchaseReport', '采购支出');
  }
}
