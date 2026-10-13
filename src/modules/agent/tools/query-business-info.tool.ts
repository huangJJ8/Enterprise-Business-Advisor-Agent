/**
 * 工商信息查询工具
 * 查询企业的工商基本信息，并附带企业画像标签
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

export function createBusinessInfoTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'query_business_info',
    description: `
查询企业的工商基本信息。

使用场景：
- 用户询问"XX企业的工商信息"
- 用户想了解企业的注册信息、法人、注册资本等

返回：企业画像标签 + 企业工商信息（法人、注册资本、成立日期、经营范围等）

注意：返回内容中包含 <co-tag> 自定义组件标签，请原样输出，不要修改或替换为其他标签。其余数据可自行组织展示。
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
    }),
    func: async (input) => {
      try {
        // 1. 通过企业名称搜索获取税号
        const searchResult = await agentApiService.searchEnterpriseByName(
          input.enterpriseName,
        );

        if (!searchResult.success || !searchResult.creditNo) {
          return '用户输入的企业错误！请确认企业名称后再次查询！';
        }

        const taxNo = searchResult.creditNo;

        // 2. 查询企业画像标签和详情（作为工商信息的兜底）
        let tagsHtml = '';
        let additionalInfo: Record<string, any> | undefined;
        const detailResult = await agentApiService.queryEnterpriseDetail([taxNo]);
        if (detailResult.success && detailResult.data?.length) {
          const first = detailResult.data[0];
          // 提取 tags 展示
          if (first.tags && first.tags.length > 0) {
            tagsHtml =
              first.tags.map((v) => `<co-tag>${v}</co-tag>`).join(' ') +
              '\n\n';
          }
          // 保存 additionalInfo 用于兜底
          additionalInfo = first.additionalInfo;
        }

        // 3. 使用税号查询工商信息
        const response = await agentApiService.getBasicInformation(taxNo);
        const body = response?.data;
        const data = body?.data;

        // 工商接口有数据则优先使用，否则用 additionalInfo 兜底
        if (data) {
          return `${JSON.stringify(data)}`;
        }

        if (additionalInfo && Object.keys(additionalInfo).length > 0) {
          return `${JSON.stringify(additionalInfo)}`;
        }

        return `未查询到企业工商信息：${body?.message || '数据为空'}`;
      } catch (error: any) {
        return `工商信息查询失败: ${error.message}`;
      }
    },
  });
}
