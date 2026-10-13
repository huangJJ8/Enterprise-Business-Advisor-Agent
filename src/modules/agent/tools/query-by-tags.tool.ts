/**
 * 组合标签查询企业列表工具
 * 根据行业和多种标签条件筛选企业
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';
import { LoggerService } from 'src/modules-global/logger/service';
import { UserInfo } from '../types/agent.types';
import { resolveRegionCodes } from './utils/region-code';
import {
  INDUSTRY_MAP,
  ALL_LEVEL2_INDUSTRIES,
  INDUSTRY_MAP_DESC,
  TAG_FIELD_MAP,
} from './utils/industry-tag-map';

export function createQueryByTagsTool({
  agentApiService,
  logger,
  userInfo,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
  userInfo: UserInfo;
}) {
  return new DynamicStructuredTool({
    name: 'query_by_tags',
    description: `
根据组合标签条件查询企业列表。

使用场景：
- 用户询问"医疗行业高新技术企业"
- 用户询问"金融科技领域瞪羚企业名单"
- 用户询问"某某企业是否属于金融科技领域高新技术企业名单"
- 用户询问"纳税信用等级为A的企业"
- 用户询问"经营活跃等级为A的企业"
- 用户询问"经营稳定性强的企业"
- 用户询问"供应商稳定性强的企业"
- 用户询问"合作时间长久的企业有哪些"
- 用户询问"合作的优质企业有哪些"
- 用户询问"稳定交易的企业有哪些"
- 用户询问"哪些供应商和A合作时间长且经营稳定"
- 用户询问"哪些供应商是瞪羚企业"
- 用户询问"稳定合作的企业中哪些是瞪羚企业"
- 用户询问"制造业500强企业"
- 用户询问"制造业不是前500强的企业"
- 用户询问"制造业前500强独角兽的企业"

支持的标签：企业规模、上市企业、专精特新、500强企业、国家技术创新示范、瞪羚企业、独角兽企业、高新技术企业、科技型中小企业、国企、央企、大专及以上院校、三甲及以上公立医院、综合评级、纳税信用等级、经营活跃度等级、经营稳定性、供应商稳定性

返回：符合条件的企业列表，支持分页
    `.trim(),
    schema: z.object({
      industry_name: z
        .array(z.string())
        .optional()
        .describe(
          `行业名称数组，传入标准的二级行业名称列表。

⚠️ 【关键规则】：
- 如果用户没有提及任何行业，绝对不要传此参数！不要自行推导或补充行业！
- 只有当用户明确提到了行业关键词时才传此参数
- 最多只能传入一个一级行业下的所有二级行业，或者同一个一级行业下的部分二级行业
- 禁止跨多个一级行业传入二级行业，禁止传入所有行业

转换规则：
- 如果用户输入的是一级行业名称（如"制造业"），传入该一级行业下的所有二级行业
- 如果用户输入的是二级行业名称（如"医药制造业"），直接传入该名称（数组只有一项）
- 如果用户输入的是非标准名称（如"服装业"），推导出最匹配的标准二级行业名称（如"纺织服装、服饰业"）
- 如果用户提到多个不同一级行业（如"制造业和金融业"），只取第一个一级行业
- 如果完全无法推导，不要传此参数

一级行业 → 二级行业映射：
${INDUSTRY_MAP_DESC}`,
        ),
      tags: z
        .array(
          z.object({
            name: z
              .string()
              .describe(
                '标签名称，如"高新技术企业"、"瞪羚企业"、"500强企业"、"纳税信用等级"、"经营活跃度等级"、"经营稳定性"、"供应商稳定性"等',
              ),
            value: z
              .string()
              .describe(
                '标签值。布尔类标签："1"=是/"0"=否；等级类标签：如"A"、"B"等；稳定性标签：如"强"、"中"、"弱"等',
              ),
            negative: z
              .boolean()
              .default(false)
              .describe('是否为否定条件，如"不是500强"则为true'),
          }),
        )
        .describe('标签条件列表'),
      pageNum: z.number().default(1).describe('页码，默认1'),
      provinceName: z
        .string()
        .optional()
        .describe('用户指定的省份名称，如"浙江省"、"广东"，未提及则不传'),
      cityName: z
        .string()
        .optional()
        .describe('用户指定的城市名称，如"杭州市"、"深圳"，未提及则不传'),
      countyName: z
        .string()
        .optional()
        .describe('用户指定的区县名称，如"海淀区"、"上城区"，未提及则不传'),
    }),
    func: async (input) => {
      try {
        // 构建 tags Map
        const tagsMap: Record<string, any> = {};

        // 添加行业
        if (input.industry_name && input.industry_name.length > 0) {
          // 校验：过滤掉不在标准二级行业列表中的名称
          const valid = input.industry_name.filter((name) =>
            ALL_LEVEL2_INDUSTRIES.includes(name),
          );
          if (valid.length === 0) {
            return `不支持查询"${input.industry_name.join('、')}"行业，请确认行业名称或联系管理员添加行业`;
          }
          tagsMap['industry_name'] = valid;
        }

        // 添加标签
        for (const tag of input.tags) {
          const fieldName = TAG_FIELD_MAP[tag.name];
          if (!fieldName) {
            logger.warn(`未识别的标签: ${tag.name}`);
            continue;
          }

          // 布尔类标签处理
          if (fieldName.startsWith('is_')) {
            tagsMap[fieldName] = tag.negative ? '0' : tag.value || '1';
          } else {
            tagsMap[fieldName] = tag.value;
          }
        }

        if (Object.keys(tagsMap).length === 0) {
          return '请提供至少一个查询条件（行业或标签）';
        }

        logger.log(
          `query_by_tags 请求参数: ${JSON.stringify({ tags: tagsMap, pageNum: input.pageNum, pageSize: 10 })}`,
        );

        // 解析地区编码：用户指定优先，未指定回退到 userInfo
        const region = resolveRegionCodes(
          {
            provinceName: input.provinceName,
            cityName: input.cityName,
            countyName: input.countyName,
          },
          // { provinceCode: userInfo.provinceCode, cityCode: userInfo.cityCode, countyCode: userInfo.countyCode },
        );

        const response = await agentApiService.queryByTags({
          tags: tagsMap,
          ...region,
          pageNum: input.pageNum,
          pageSize: 10,
        });

        if (response.returnCode === 'NETWORK_ERROR') {
          return '查询服务暂时不可用，请稍后重试';
        }

        if (!response.success) {
          return `查询失败：${response.returnMessage}`;
        }

        const { enterprises, total, pageNum, totalPages } = response.data;

        // 用于展示的行业描述
        const industryDesc = tagsMap['industry_name']
          ? (tagsMap['industry_name'] as string[]).join('、')
          : undefined;

        if (!enterprises || enterprises.length === 0) {
          const condDesc = buildConditionDescription(industryDesc, input.tags);
          return `未查询到符合条件的企业（输出的行业和标签以 ${condDesc} 为准）。您可以尝试调整筛选条件。`;
        }

        const condDesc = buildConditionDescription(industryDesc, input.tags);

        let answer = `符合"${condDesc}"的企业列表（共${total}条）：\n\n`;

        enterprises.forEach((ent) => {
          answer += `<go input="查看${ent.enterpriseName}工商数据">${ent.enterpriseName}</go>\n\n`;
        });

        if (totalPages > 1) {
          answer += `<pages title="查询${condDesc}企业" pages="${totalPages}" pagenum="${pageNum}" total="${total}"></pages>`;
        }

        return answer;
      } catch (error: any) {
        logger.error(`组合标签查询企业失败: ${error.message}`, error.stack);
        return '查询服务暂时不可用，请稍后重试';
      }
    },
  });
}

/**
 * 构建条件描述文本
 */
function buildConditionDescription(
  industryDesc?: string,
  tags?: Array<{ name: string; value: string; negative: boolean }>,
): string {
  const parts: string[] = [];
  if (industryDesc) {
    parts.push(industryDesc);
  }
  if (tags) {
    for (const tag of tags) {
      if (tag.negative) {
        parts.push(`非${tag.name}`);
      } else if (tag.value && tag.value !== '1') {
        parts.push(`${tag.name}${tag.value}`);
      } else {
        parts.push(tag.name);
      }
    }
  }
  return parts.join(' + ') || '全部';
}
