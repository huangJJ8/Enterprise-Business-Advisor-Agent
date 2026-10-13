/**
 * 准入企业列表查询工具
 * 查询符合/不符合准入的企业列表
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';

export function createAdmissionListTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'query_admission_list',
    description: `
查询符合或不符合准入条件的企业列表。

使用场景：
- 用户询问"符合准入的企业列表"
- 用户询问"不符合准入的企业有哪些"
- 用户想查看准入企业名单

返回：准入/不准入企业列表，企业名称使用<go>标签包裹可点击查看工商信息
    `.trim(),
    schema: z.object({
      searchStatus: z
        .number()
        .describe('查询类型：1=符合准入的企业，2=不符合准入的企业'),
    }),
    func: async (input) => {
      try {
        const response = await agentApiService.getCorpListBySearchStatus(
          input.searchStatus,
        );
        const body = response?.data;
        logger.log('query_admission_list body: ' + JSON.stringify(body));
        const data = body?.data;

        if (!data || !Array.isArray(data) || data.length === 0) {
          return '暂无准入查询记录';
        }

        const label =
          input.searchStatus === 1 ? '符合准入' : '不符合准入';
        const lines = data.map(
          (item: any) =>
            `<go input="查看${item.corpName}工商信息">${item.corpName}</go>`,
        );

        return `${label}的企业如下：<br>${lines.join('<br>')}`;
      } catch (error: any) {
        return `准入企业列表查询失败: ${error.message}`;
      }
    },
  });
}
