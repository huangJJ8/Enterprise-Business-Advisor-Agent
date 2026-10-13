/**
 * 可营销名单查询工具
 * 查询可以营销的企业名单
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

export function createMarketableListTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'query_marketable_list',
    description: `
查询营销商机 / 可营销企业名单（通用营销商机工具）。

⚠️ 【默认营销商机工具】：当用户提到"营销商机"、"商机"、"营销机会"、"营销名单"等关键词时，默认使用本工具。
仅当用户明确提到"示例银行"关键字时才使用 get_marketing_opportunities 工具。

使用场景：
- 用户询问"营销商机"、"商机列表"、"有哪些营销机会"
- 用户询问"可以营销的企业名单"、"营销的名单"
- 用户想知道可以营销的目标企业
- 用户要求"换一批营销推荐名单"、"换一批"

返回：可营销企业列表，企业名称使用<go>标签包裹可点击查看工商信息，底部附带"换一批"按钮
    `.trim(),
    schema: z.object({}),
    func: async () => {
      try {
        const response = await agentApiService.queryCorpCKInfo();
        const body = response?.data;
        const data = body?.data;

        console.log('queryCorpCKInfo', body)

        if (!data || !Array.isArray(data) || data.length === 0) {
          return '抱歉，暂无符合条件的企业名单，您可以反馈需要的企业标签，我们会持续关注您的反馈~';
        }

        const lines = data.map(
          (item: any) =>
            `<go input="查看${item.corpName}工商信息">${item.corpName}</go>`,
        );

        return `推荐营销名单：\n\n${lines.join('\n\n')}\n\n<go input="换一批营销推荐名单">换一批</go>`;
      } catch (error: any) {
        return `可营销名单查询失败: ${error.message}`;
      }
    },
  });
}
