/**
 * 核企查询工具
 * 查询企业是否为核心企业
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

export function createCoreEnterpriseTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'check_core_enterprise',
    description: `
查询企业是否为核心企业。

使用场景：
- 用户询问"XX企业是否是核企"
- 用户询问"查一下XX公司是不是核心企业"

返回：企业是否符合核企条件的结果
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
    }),
    func: async (input) => {
      try {
        // 内部自动完成企业验证和权限校验
        const verifyResult = await agentApiService.verifyEnterprise(input.enterpriseName);
        if (!verifyResult.success) {
          return verifyResult.errorMessage!;
        }
        const taxNo = verifyResult.taxNo!;
        const name = verifyResult.matchedName || input.enterpriseName;

        // searchType=2 表示查核企
        const response = await agentApiService.getSearchResult({
          taxNo,
          searchType: '2',
        });

        const body = response?.data;
        const searchStatus = body?.data?.searchStatus;

        if (searchStatus === 1 || searchStatus === '1') {
          return `恭喜，${name}符合核企条件。`;
        } else if (searchStatus === 2 || searchStatus === '2') {
          return `抱歉，${name}不符合核企条件。我们帮您加入动态监测池，将定期追踪其经营动态，相关信息会实时提醒您，便于您及时捕捉合作机会～`;
        }

        return `抱歉，未查询到${name}的核企数据。若在授权中请耐心等待5-10分钟后再查询。`;
      } catch (error: any) {
        return `核企查询失败: ${error.message}`;
      }
    },
  });
}
