/**
 * 产品匹配工具
 * 用于为企业推荐匹配的产品
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import { AgentConfig } from '../config/agent.config';
import { UserContext } from '../types/agent.types';
import { getProductMatchPages } from './utils/pages';

export function createProductMatchTool({
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
    name: 'match_products',
    description: `
为企业匹配推荐产品。

使用场景：
- 用户询问"产品匹配"
- 用户想知道某个企业适合哪些产品
- 用户问"对XX企业进行产品匹配"
- 用户想查看推荐的产品列表

功能：
1. 如果用户没有指定企业，返回企业列表供用户选择
2. 如果用户指定了企业，先验证权限，然后获取该企业的推荐产品列表

返回：企业列表（供选择）或推荐产品列表（人类语言描述），包含<g3>和<pages>标签，内容必须全部输出
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().optional().describe('企业名称（可选，不传则返回企业列表供选择）'),
      pageNum: z.number().default(1).describe('页码，默认为1'),
    }),
    func: async (input) => {
      try {
        // 检查机构号是否在产品匹配白名单中
        const isInWhitelist = config.productMatchWhitelist.includes(
          userContext.orgNo,
        );

        logger.log(
          `机构号 ${userContext.orgNo} 产品匹配白名单检查: ${isInWhitelist}`,
        );

        if (!isInWhitelist) {
          return '抱歉，您所在的机构暂未开通产品匹配功能。';
        }

        // 如果没有指定企业，返回企业列表供用户选择
        if (!input.enterpriseName) {
          const response = await agentApiService.listTaxNoInfo({
            pageNum: input.pageNum,
            pageSize: 10,
          });

          const result = getProductMatchPages({
            json: response.data,
            listTitle: '请选择您要进行产品匹配的企业：',
          });

          return result.answer.trim();
        }

        // 内部自动完成企业验证和权限校验
        const verifyResult = await agentApiService.verifyEnterprise(input.enterpriseName);
        if (!verifyResult.success) {
          return verifyResult.errorMessage!;
        }
        const taxNo = verifyResult.taxNo!;

        // 如果指定了企业，获取推荐产品列表
        const response = await agentApiService.getRecommendProductList({
          taxNo,
        });

        const result = JSON.stringify(response?.data || '{}');

        return result.trim();
      } catch (error: any) {
        return `产品匹配失败: ${error.message}`;
      }
    },
  });
}
