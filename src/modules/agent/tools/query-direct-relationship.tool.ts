/**
 * 两企业直接交易关系查询工具
 * 查询两个指定企业之间是否存在上下游/交易关系
 * 注意：此工具与 enterprise_relationship 不同，enterprise_relationship 是查询企业与"核心企业"的关系，
 * 本工具是查询任意两个企业之间的直接交易关系
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';
import { LoggerService } from 'src/modules-global/logger/service';

export function createDirectRelationshipTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'query_direct_relationship',
    description: `
查询两个指定企业之间的直接交易关系（非核心企业场景）。

使用场景（必须同时提到两个企业名称）：
- 用户询问"A企业是否在B企业的上下游"
- 用户询问"A企业和B企业是否有交易关系"
- 用户询问"A企业是否是B企业的供应商/客户"

⚠️ 注意区分：
- 本工具：查询两个指定企业之间的直接关系，用户会明确提到两个企业名称
- enterprise_relationship：查询一个企业与核心企业（机构配置的核企）的关系，用户只提到一个企业名称并提及"核企"

返回：两企业之间的上下游关系和交易情况
    `.trim(),
    schema: z.object({
      enterpriseNameA: z.string().min(1).describe('企业A的名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入。必须严格使用用户原文中的企业名称，禁止自行补全或修改，后续会通过模糊搜索匹配'),
      enterpriseNameB: z.string().min(1).describe('企业B的名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入。必须严格使用用户原文中的企业名称，禁止自行补全或修改，后续会通过模糊搜索匹配'),
    }),
    func: async (input) => {
      try {
        // 1. 分别获取两个企业的税号
        const [searchA, searchB] = await Promise.all([
          agentApiService.searchEnterpriseByName(input.enterpriseNameA),
          agentApiService.searchEnterpriseByName(input.enterpriseNameB),
        ]);

        if (!searchA.success || !searchA.creditNo) {
          return `未找到企业"${input.enterpriseNameA}"，请确认企业名称后再次查询。`;
        }

        if (!searchB.success || !searchB.creditNo) {
          return `未找到企业"${input.enterpriseNameB}"，请确认企业名称后再次查询。`;
        }

        const nameA = searchA.matchedName || input.enterpriseNameA;
        const nameB = searchB.matchedName || input.enterpriseNameB;

        // 2. 调用直接关系查询接口
        const response = await agentApiService.queryDirectRelationship({
          enterpriseA: searchA.creditNo,
          enterpriseB: searchB.creditNo,
        });

        console.log('==queryDirectRelationship--response==', response)

        if (!response.success) {
          return '查询服务暂时不可用，请稍后重试。';
        }

        const { isUpstream, isDownstream, hasTransaction, description } = response.data;

        // 3. 组装结果
        const relations: string[] = [];

        if (isUpstream) {
          relations.push(`${nameA}是${nameB}的上游供应商`);
        }
        if (isDownstream) {
          relations.push(`${nameA}是${nameB}的下游客户`);
        }

        if (hasTransaction) {
          if (relations.length > 0) {
            return `${nameA}与${nameB}存在交易关系。${relations.join('，')}。`;
          }
          return `${nameA}与${nameB}存在交易关系。`;
        }

        return `${nameA}与${nameB}之间无交易关系。`;
      } catch (error: any) {
        logger.error(
          `两企业直接交易关系查询失败: ${error.message}`,
          error.stack,
        );
        return '查询服务暂时不可用，请稍后重试。';
      }
    },
  });
}
