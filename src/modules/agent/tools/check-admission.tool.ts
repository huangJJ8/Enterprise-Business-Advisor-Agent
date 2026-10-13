/**
 * 准入查询工具
 * 查询企业是否符合某产品的准入条件，或列出企业可操作的产品列表
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

export function createAdmissionQueryTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'check_admission',
    description: `
查询企业是否符合某产品的准入条件，或查询企业能准入的产品有哪些。

使用场景：
- 用户询问"XX企业是否符合XX产品准入"（包括"银行信贷产品准入"）：传 enterpriseName + productName，返回准入结果
- 用户询问"XX企业能准入的产品有哪些"：只传 enterpriseName，不传 productName，返回该企业可操作的产品列表（每个产品可点击查询准入）

⚠️ 关键判断：只要用户提到了具体企业名称 + 准入，就应该使用本工具，而不是 query_credit_product_list。

返回：准入查询结果，或可点击的产品列表
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
      productName: z
        .string()
        .optional()
        .describe('产品名称（可选，不传则返回产品列表供用户选择）'),
      modelNo: z.string().optional().describe('产品编号（可选）'),
    }),
    func: async (input) => {
      try {
        // 内部自动完成企业验证和权限校验
        const verifyResult = await agentApiService.verifyEnterprise(input.enterpriseName);
        if (!verifyResult.success) {
          return verifyResult.errorMessage!;
        }
        const taxNo = verifyResult.taxNo!;
        const enterpriseName = verifyResult.matchedName || input.enterpriseName;
        // 未指定产品：列出机构下所有产品，生成 <go> 按钮供用户逐个查准入
        if (!input.productName && !input.modelNo) {
          const productResponse = await agentApiService.getProductList();
          const products = productResponse?.data?.data || [];

          if (products.length === 0) {
            return '您当前所处机构下暂无产品数据';
          }

          const lines = products
            .filter((p: any) => p.projectName)
            .map(
              (p: any) =>
                `<go input="${enterpriseName}是否能够准入${p.projectName}">${p.projectName}</go>`,
            );

          return `当前机构下的产品列表如下，请点击您要查询准入的产品：<br>${lines.join('<br>')}`;
        }

        // 指定了产品：执行单产品准入查询
        let modelNo = input.modelNo || '';

        if (input.productName && !modelNo) {
          const productResponse = await agentApiService.getProductList();
          const products = productResponse?.data?.data || [];
          const matched = products.find(
            (p: any) =>
              p.projectName === input.productName ||
              p.projectName?.includes(input.productName),
          );

          if (!matched) {
            const names = products
              .map((p: any) => p.projectName)
              .filter(Boolean);
            if (names.length === 0) {
              return '您当前所处机构下暂无产品数据';
            }
            return `暂无该产品权限，您可询问以下产品：\n${names.join('\n')}`;
          }

          modelNo = matched.modelNo || '';
        }

        const response = await agentApiService.getSearchResult({
          taxNo,
          searchType: '1',
          modelNo,
        });

        const body = response?.data;
        const searchStatus = body?.data?.searchStatus;

        if (searchStatus === 1 || searchStatus === '1') {
          return `恭喜，该企业符合${input.productName || '该产品'}准入。`;
        } else if (searchStatus === 2 || searchStatus === '2') {
          return `抱歉，该企业不符合${input.productName || '该产品'}准入。\n我们帮您加入动态监测池，将定期追踪其经营动态，相关信息会实时提醒您，便于您及时捕捉合作机会～`;
        } else if (searchStatus === 3 || searchStatus === '3') {
          return '抱歉，未查询到企业数据！若在授权中请耐心等待5-10分钟后再查询。若未授权请复制链接或二维码发送贷款客户进行数据授权。';
        }

        return '未查询到产品信息';
      } catch (error: any) {
        return `准入查询失败: ${error.message}`;
      }
    },
  });
}
