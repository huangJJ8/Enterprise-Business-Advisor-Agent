/**
 * 企业经营状态查询工具
 * 查询企业是否在营
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

const CHECK_TYPE_MAP: Record<string, string> = {
  is_online: 'is_online',
};

const CHECK_TYPE_LABELS: Record<string, { success: string; fail: string }> = {
  is_online: {
    success: '在营',
    fail: '没有在营',
  },
};

export function createCorpStatusTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'check_corp_status',
    description: `
查询企业是否在营。

使用场景：
- 用户询问"XX企业是否在营"、"XX企业是否正常营业"

返回：企业状态查询结果
    `.trim(),
    schema: z.object({
      corpName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
      checkType: z
        .enum(['is_online'])
        .describe('检查类型：is_online=是否在营'),
    }),
    func: async (input) => {
      try {
        const checkName = CHECK_TYPE_MAP[input.checkType];
        const labels = CHECK_TYPE_LABELS[input.checkType];

        const response = await agentApiService.checkCorpStatus(
          input.corpName,
          checkName,
        );

        const body = response?.data;
        const data = body?.data;

        if (!data) {
          return `请求异常：${body?.message || '未知错误'}`;
        }

        const isMatch = data.isMatch;
        if (isMatch === true || isMatch === 'true') {
          return `${input.corpName} ${labels.success}。`;
        } else {
          return `${input.corpName} ${labels.fail}。`;
        }
      } catch (error: any) {
        return `企业状态查询失败: ${error.message}`;
      }
    },
  });
}
