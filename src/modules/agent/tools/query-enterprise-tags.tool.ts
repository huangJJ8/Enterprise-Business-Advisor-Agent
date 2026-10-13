/**
 * 企业营销标签查询工具
 * 根据企业名称查询该企业的画像标签信息
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';
import { LoggerService } from 'src/modules-global/logger/service';

export function createQueryEnterpriseTagsTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'query_enterprise_tags',
    description: `
查询企业的营销标签/企业标签/画像标签。
当用户询问某企业的营销标签、企业标签时使用。

使用场景：
- 用户询问"XX企业的营销标签是什么"
- 用户询问"XX企业的标签"
- 用户询问"查看XX的营销标签"
- 用户询问"XX公司标签信息"

参数：enterpriseName（必填）- 企业名称
    `.trim(),
    schema: z.object({
      enterpriseName: z
        .string()
        .min(1)
        .describe('企业名称（必填）。必须从用户的问题或对话上下文中提取企业全称传入'),
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
        const matchedName = searchResult.matchedName || input.enterpriseName;

        logger.log(
          `[query_enterprise_tags] 企业搜索成功，taxNo: ${taxNo}, matchedName: ${matchedName}`,
        );

        // 2. 使用税号查询企业画像标签
        const tagResult = await agentApiService.queryEnterpriseDetail([taxNo]);

        if (!tagResult.success || !tagResult.data || tagResult.data.length === 0) {
          return `未查询到${matchedName}的标签信息，${tagResult.errorMessage || '请稍后重试'}`;
        }

        const enterprise = tagResult.data[0];
        const tags = enterprise.tags;

        const tip = `\n\n<g1 input="获取采集链接">获取采集链接</g1>`

        if (!tags || tags.length === 0) {
          return `${matchedName}暂无标签信息。` + tip;
        }

        // 所有标签值都是"--"，说明尚未采集到有效标签
        const allEmpty = tags.every((t) => {
          const value = t.includes('：') ? t.split('：')[1]?.trim() : t.trim();
          return value === '--';
        });
        if (allEmpty) {
          return `${matchedName}暂无标签信息。`+ tip;
        }

        // 3. 格式化标签结果返回给 Agent
        // 包含"："的项保持原样，不包含"："的项合并到"资质标签"行
        const normalTags = tags.filter((t) => t.includes('：'));
        const qualificationTags = tags.filter((t) => !t.includes('：'));

        const tagText = normalTags.map((t) => `- ${t}`).join('\n');
        const qualificationLine =
          qualificationTags.length > 0
            ? `\n- 资质标签：${qualificationTags.join('、')}`
            : '';

        return `${matchedName}的企业标签信息如下：\n\n${tagText}${qualificationLine}`;
      } catch (error: any) {
        logger.error(
          `企业标签查询失败: ${error.message}`,
          error.stack,
        );
        return '查询服务暂时不可用，请稍后重试';
      }
    },
  });
}
