/**
 * 企业标签搜索工具
 * 按地区和企业标签搜索企业列表
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import {
  getRegionCode,
  getLabelCode,
  SUPPORTED_LABELS,
} from './utils/region-code';

export function createEnterpriseTagSearchTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'search_enterprise_by_tag',
    description: `
按地区和企业标签搜索企业列表。

使用场景：
- 用户询问"XX地区的高新技术企业"
- 用户询问"有哪些专精特新企业"
- 用户查询某类标签的企业

支持的企业标签：${SUPPORTED_LABELS.join('、')}

注意：仅支持查询纳税信用等级为A的企业，不支持其他等级。

返回：符合标签条件的企业列表
    `.trim(),
    schema: z.object({
      areaName: z
        .string()
        .default('北京市')
        .describe('地区名称，如"山东省"、"济南市"，默认北京市'),
      label: z.string().describe('企业标签名称，如"高新技术企业"、"专精特新"'),
    }),
    func: async (input) => {
      try {
        const labelCode = getLabelCode(input.label);
        if (!labelCode) {
          return `不支持查询"${input.label}"标签，支持的标签有：${SUPPORTED_LABELS.join('、')}`;
        }

        const areaCode = getRegionCode(input.areaName);

        const response = await agentApiService.tagSearchCompany(
          areaCode,
          labelCode,
        );
        const body = response?.data;
        logger.log('search_enterprise_by_tag body: ' + JSON.stringify(body));
        const result = body?.data?.result;

        if (!result || !Array.isArray(result) || result.length === 0) {
          return '抱歉呀，目前暂时没有查询到相关数据呢。你可以再补充一些信息，我再帮你试试看~';
        }

        const total = body?.data?.total || result.length;
        const lines = result.map(
          (item: any) => `${item.corpName || item.name}`,
        );

        return `${input.areaName}符合${input.label}的查询结果如下（共${total}条）：<br>${lines.join('<br>')}`;
      } catch (error: any) {
        return `企业标签搜索失败: ${error.message}`;
      }
    },
  });
}
