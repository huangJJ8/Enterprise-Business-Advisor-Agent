/**
 * 报告详情工具 - 查询报告列表，支持查看/下载PDF和生成新报告
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import { AgentConfig } from '../config/agent.config';
import { UserContext } from '../types/agent.types';
import { buildUserId } from '../utils/build-user-id';
export function createReportDetailTool({
  agentApiService,
  logger,
  config,
  userContext,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
  config: AgentConfig;
  userContext: UserContext;
}) {
  return new DynamicStructuredTool({
    name: 'report_detail',
    description: `
查询企业的报告列表，展示已生成的PDF报告，支持查看和下载。

使用场景：
- 用户想查看某个企业的报告详情
- 用户询问企业的报告列表
- 用户明确要求"报告详情"、"详细报告"、"完整报告"、"PDF报告"等
- 用户想下载或查看企业报告
- 用户想生成新的企业报告

参数：
- enterpriseName: 企业名称（必需）
- pageNum: 页码（可选，默认1）

返回：
- 报告列表（含查看/下载按钮）和生成新报告按钮

【重要】输出规则：
1. 必须完整输出工具返回的所有内容
2. 保留所有 HTML 标签（<report-card>、<pages>、<generatereport> 等）和 markdown 格式
3. 不要修改任何标签属性
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
      pageNum: z.number().optional().describe('页码，默认1'),
    }),
    func: async (input) => {
      try {
        logger.log(`查询报告详情: ${input.enterpriseName}`);

        // 1. 验证企业权限并获取税号
        const verifyResult = await agentApiService.verifyEnterprise(
          input.enterpriseName,
        );

        if (!verifyResult.success) {
          return verifyResult.errorMessage!;
        }

        
        const taxNo = verifyResult.taxNo!;
        const matchedName = verifyResult.matchedName!;

        // 2. 构造 userId
        const userId = buildUserId(userContext.orgChannelUserId);
        const pageNum = input.pageNum || 1;

        // 4. 调用 saasCheck 获取报告列表
        logger.log(`获取报告列表: taxNo=${taxNo}, userId=${userId}, page=${pageNum}`);
        const reportResponse = await agentApiService.getReportList({
          saasCheckUrl: config.saasCheckUrl,
          taxNo,
          userId,
          pageNum,
          pageSize: 10,
        });

        const responseData = reportResponse.data;
        logger.log(`报告列表响应: ${JSON.stringify(responseData)}`);

        if (!responseData || responseData.status !== 200 || !responseData.data) {
          return '获取报告列表失败';
        }

        const { list = [], totalRowCount, pageCount, page } = responseData.data;

        if (list.length === 0) {
          // 没有报告，只显示生成按钮
          const generateData = encodeURIComponent(JSON.stringify({
            taxNo,
            userId,
          }));
          return `该企业暂无报告记录。\n\n<generatereport data="${generateData}">生成新报告</generatereport>`;
        }

        // 5. 构建报告卡片列表，每条报告一个 <report-card>
        let markdown = `\n\n### ${matchedName}-报告列表\n\n`;

        for (const item of list) {
          const proxyParams = `reportFile=${encodeURIComponent(item.reportFile || '')}&userId=${userId}&taxNo=${taxNo}`;
          const previewUrl = item.reportStatus === '2'
            ? `${config.agentPublicUrl}/agent/pdfPreview?${proxyParams}`
            : '';
          const downloadUrl = item.reportStatus === '2'
            ? `${config.agentPublicUrl}/agent/pdfPreview?${proxyParams}&download=1`
            : '';

          const cardData = encodeURIComponent(JSON.stringify({
            reportId: item.reportId,
            reportTime: item.reportTime || '--',
            reportStatus: item.reportStatus,
            previewUrl,
            downloadUrl,
          }));

          markdown += `<report-card data="${cardData}"></report-card>\n\n`;
        }

        // 6. 分页组件
        if (pageCount > 1) {
          markdown += `<pages title="查看${matchedName}报告详情" pages="${pageCount}" pagenum="${page}" total="${totalRowCount}"></pages>\n\n`;
        }

        // 7. 生成新报告按钮
        const generateData = encodeURIComponent(JSON.stringify({
          taxNo,
          userId,
        }));
        markdown += `<generatereport data="${generateData}">生成新报告</generatereport>\n\n`;
        markdown += `<g1 input="查看${matchedName}报告详情">更新列表数据</g1>\n\n`;

        return markdown;
      } catch (error: any) {
        logger.error(`查询报告详情失败: ${error.message}`, error.stack);
        return `查询报告详情失败: ${error.message}`;
      }
    },
  });
}
