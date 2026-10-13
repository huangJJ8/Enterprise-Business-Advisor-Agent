/**
 * 银行信贷产品列表查询工具
 * 查询当前机构下的银行信贷产品列表
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

export function createCreditProductListTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'query_credit_product_list',
    description: `
查询当前机构下的银行信贷产品列表。

使用场景：
- 用户询问"我有哪些信贷产品"、"信贷产品列表"、"查询银行信贷产品"、"银行信贷产品列表"
- 用户想了解当前机构可用的银行信贷产品

⚠️ 注意：如果用户提到了具体企业名称并询问准入（如"XX企业是否符合XX准入"），应使用 check_admission 工具，而不是本工具。

返回：银行信贷产品名称列表，使用<go>标签包裹使其可点击
    `.trim(),
    schema: z.object({}),
    func: async () => {
      try {
        const response = await agentApiService.getProductList();
        const body = response?.data;

        if (!body?.data || body.data.length === 0) {
          return '您当前所处机构下暂无银行信贷产品数据';
        }

        const products = body.data;
        const lines = products.map(
          (p: any) => `<go input="${p.projectName}">${p.projectName}</go>`,
        );

        return `当前机构银行信贷产品列表如下：<br>${lines.join('<br>')}<br><br>您也可以问："XX企业是否符合银行信贷产品XX准入"？`;
      } catch (error: any) {
        return `查询银行信贷产品列表失败: ${error.message}`;
      }
    },
  });
}
