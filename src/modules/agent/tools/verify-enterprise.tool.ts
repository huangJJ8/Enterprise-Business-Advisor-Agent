/**
 * 企业验证工具
 * 用于验证企业名称并检查用户权限
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';

export function createEnterpriseVerifyTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'verify_enterprise',
    description: `
验证企业名称并检查用户权限。

使用场景：
- 指定使用此工具时必须先调用此工具，否则不使用

功能：
1. 根据企业名称模糊匹配获取准确的企业信息和税号
2. 验证用户是否有权限访问该企业（是否已采集）

返回：企业税号和名称（如果验证成功），或错误信息
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
    }),
    func: async (input) => {
      try {
        // 第一步：通过企业名称获取税号
        const result = await agentApiService.searchEnterpriseByName(
          input.enterpriseName,
        );

        if (!result.success) {
          return result.errorMessage!;
        }

        const { creditNo, matchedName } = result;

        // 第二步：验证用户是否有权限访问该企业
        const checkResponse = await agentApiService.checkUserHasTaxNo(creditNo!);

        const success = checkResponse.data?.success;

        if (success) {
          return `未查询到企业"${matchedName}"或您没有权限访问该企业。请确认：\n1. 该企业是否已添加到您的采集列表\n2. 您是否有权限访问该企业的数据`;
        }

        // 验证成功，返回企业信息
        return `✅ 企业验证成功\n企业名称：${matchedName}\n企业税号：${creditNo}\n您可以继续查询该企业的相关信息。`;
      } catch (error: any) {
        return `企业验证失败: ${error.message}`;
      }
    },
  });
}
