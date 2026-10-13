/**
 * 企业上下游 Top20 查询工具
 * 查询企业的上游/下游/上下游企业名单（不涉及"核心"关键字的场景）
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';
import { LoggerService } from 'src/modules-global/logger/service';
import { UserInfo, Top20Partner } from '../types/agent.types';
import { AuthCheckerService } from '../services/auth-checker.service';

const DIRECTION_LABELS: Record<string, string> = {
  upstream: '上游',
  downstream: '下游',
  both: '上下游',
};

/**
 * 构建单个 <top20> 标签的 JSON 数据（一个标签对应一个企业卡片）
 */
function buildTop20Tag(
  partner: Top20Partner,
  direction: string,
  enterpriseName: string,
  tags?: string[],
): string {
  const tagData = JSON.stringify({
    enterpriseName,
    direction,
    partner: {
      enterpriseId: partner.enterpriseId,
      enterpriseName: partner.enterpriseName,
      relationshipType: partner.relationshipType,
      recommendationStars: partner.recommendationStars,
      willingness: partner.willingness,
      industry: partner.industry,
      transactionAmount: partner.transactionAmount,
      transactionCount: partner.transactionCount,
      tags: tags || [],
    },
  });
  return `<top20 data='${tagData}'></top20>`;
}

export function createQueryTop20Tool({
  agentApiService,
  logger,
  userInfo,
  authCheckerService,
  userQuery,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
  userInfo: UserInfo;
  authCheckerService: AuthCheckerService;
  userQuery: string;
}) {
  return new DynamicStructuredTool({
    name: 'query_top20',
    description: `
查询企业的上下游企业名单。
⚠️ 仅用于用户未提及"核心"或"核企"关键字的场景。只要用户提到了"核心"或"核企"，必须使用 enterprise_relationship 工具。

使用场景：
- 用户询问"查询企业A的前十大交易对手"、"查询企业A的前十大供应商"、"查询企业A的前十大客户"
- 用户询问"查询企业A的上下游企业"
- 用户询问"企业A的上游企业有哪些"
- 用户询问"企业A的下游企业有哪些"
- 用户询问"请给我企业A的上游和下游名单"
- 用户询问"企业A上下游分别有哪些公司"
- 用户询问"帮我查一下企业A的供应商和客户"
- 用户询问"企业A的供应链上下游关系"
- 用户询问"跟企业A有供货和销货关系的企业有哪些"
- 用户询问"哪些企业给企业A供货？企业A又卖给谁？"

返回：企业上下游企业名单，如果有 <top20> 或者 <go> 标签必须完整展示，闭合标签不能省略
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
      direction: z
        .enum(['upstream', 'downstream', 'both'])
        .describe(
          '查询方向：upstream=上游（供应商），downstream=下游（客户），both=上下游',
        ),
    }),
    func: async (input) => {
      const directionLabel = DIRECTION_LABELS[input.direction];

      try {
        // 1. 企业验证
        const verifyResult = await agentApiService.verifyEnterprise(
          input.enterpriseName,
        );

        if (!verifyResult.success) {
          // 没有税号返回 → 企业未找到，直接返回错误信息
          if (!verifyResult.taxNo) {
            return verifyResult.errorMessage!;
          }

          // 有税号但校验未通过 → 走授权校验拦截
          const authResult = await authCheckerService.checkAuthAndBuildResponse({
            orgNo: userInfo.orgNo,
            corpTaxNo: verifyResult.taxNo,
            enterpriseName: input.enterpriseName,
            subjectName: input.enterpriseName,
            originalQuestion: userQuery,
            operatorUserId: userInfo.id,
            operatorUserName: userInfo.name || '',
          });

          if (!authResult.hasAuth) {
            return authResult.responseMessage!;
          }
        }

        const taxNo = verifyResult.taxNo!;
        const matchedName = verifyResult.matchedName || input.enterpriseName;

        logger.log(`[query_top20] 企业验证完成，taxNo: ${taxNo}, matchedName: ${matchedName}`);

        // 2. 如果企业在采集列表中（验证通过），尝试获取简易报告数据
        if (verifyResult.success) {
          logger.log(`[query_top20] → 走简易报告分支，调用 queryReportInterpret`);
          try {
            const reportResponse = await agentApiService
              .queryReportInterpret(taxNo)
              .catch((e: any) => {
                logger.error(`[query_top20] queryReportInterpret 失败: ${e.message}`);
                return null;
              });

            if (reportResponse?.data) {
              const rpa = reportResponse.data;
              const rpaData = Array.isArray(rpa)
                ? rpa
                : rpa.data && Array.isArray(rpa.data)
                  ? rpa.data
                  : null;

              if (rpaData) {
                logger.log(`[query_top20] 简易报告数据获取成功，数据段数: ${rpaData.length}`);
                // 从简易报告中提取上下游企业数据，固定格式展示
                const salesData = rpaData[1]?.data || rpaData[1] || {};
                const downCorps: any[] = salesData.downTopCorp || [];
                const upCorps: any[] = salesData.upTopCorp || [];

                const sections: string[] = [];
                sections.push(`以下是${matchedName}的上下游企业信息：\n`);

                // 下游客户（仅在查询方向包含下游时展示）
                if (input.direction === 'downstream' || input.direction === 'both') {
                  sections.push(`#### 近12月前十大客户（下游）\n`);
                  if (downCorps.length > 0) {
                    downCorps.forEach((c: any) => {
                      const name = c.customer || '未知企业';
                      const rate = c.amountTaxRate ? `${c.amountTaxRate}%` : '--';
                      const amount = c.amountTax || '--';
                      const industry = c.industryName || '--';
                      sections.push(`<go input="查看${name}工商数据">${name}</go>  销售占比：${rate}, 销售金额：${amount}元, 行业：${industry}\n`);
                    });
                  } else {
                    sections.push(`暂无下游客户数据\n`);
                  }
                }

                // 上游供应商（仅在查询方向包含上游时展示）
                if (input.direction === 'upstream' || input.direction === 'both') {
                  sections.push(`\n\n#### 近12月前十大供应商（上游）\n`);
                  if (upCorps.length > 0) {
                    upCorps.forEach((s: any) => {
                      const name = s.customer || '未知企业';
                      const rate = s.amountTaxRate ? `${s.amountTaxRate}%` : '--';
                      const amount = s.amountTax || '--';
                      const industry = s.industryName || '--';
                      sections.push(`<go input="查看${name}工商数据">${name}</go>  采购占比：${rate}, 采购金额：${amount}元, 行业：${industry}\n`);
                    });
                  } else {
                    sections.push(`暂无上游供应商数据\n`);
                  }
                }

                sections.push(`\n⚠️ 严禁生成 <top20> 标签！本次数据来自简易报告而非 Top20 接口。<go>标签要原样输出，不要修改或省略。引导标签必须使用<g1>`);
                return sections.join('\n');
              }
              logger.log(`[query_top20] 简易报告数据为空，降级走 top20 分支`);
            } else {
              logger.log(`[query_top20] reportResponse.data 为空，降级走 top20 分支`);
            }
          } catch (e: any) {
            logger.error(`[query_top20] 获取简易报告异常: ${e.message}`);
          }
          // 如果简易报告获取失败，继续走 top20 逻辑
        }

        // 3. 调用 Top20 查询接口
        logger.log(`[query_top20] 调用 queryTop20，direction: ${input.direction}`);
        const response = await agentApiService.queryTop20({
          taxNo,
          orgNo: userInfo.orgNo,
          // taxNo: '91EXAMPLE0000000100',
          // orgNo: 'ORG0000000000000001',
          direction: input.direction,
        });

        // 4. 处理错误
        if (response.returnCode === '40404') {
          return '企业未找到';
        }

        if (response.returnCode === 'NETWORK_ERROR') {
          return '查询服务暂时不可用，请稍后重试';
        }

        if (
          !response.success ||
          !response.data.partners ||
          response.data.partners.length === 0
        ) {
          return `未查询到${matchedName}的${directionLabel}企业信息。`;
        }

        // 5. 批量查询企业画像标签（返回数组与入参一一对应）
        const partners = response.data.partners;
        const enterpriseIds = partners.map((p) => p.enterpriseId);
        let tagsList: string[][] = [];
        try {
          const detailResult =
            await agentApiService.queryEnterpriseDetail(enterpriseIds);
          if (detailResult.success && detailResult.data) {
            const KEEP_TAG_KEYWORDS = ['企业规模', '综合评级', '所属行业'];
            tagsList = detailResult.data.map((item) =>
              (item.tags || []).filter((tag) =>
                KEEP_TAG_KEYWORDS.some((kw) => tag.includes(kw)),
              ),
            );
          }
          logger.log(
            `[query_top20] 企业标签查询成功，获取到 ${tagsList.length} 条标签数据`,
          );
        } catch (e: any) {
          logger.error(
            `[query_top20] 企业标签查询失败，不影响主流程: ${e.message}`,
          );
        }

        // 6. 构建 <top20> 标签返回（每个 partner 一个标签）
        const top20Tags = partners
          .map((p, i) =>
            buildTop20Tag(p, input.direction, matchedName, tagsList[i]),
          )
          .join('\n\n');

        return `<output>我已根据您的条件为您筛选出${matchedName}的${directionLabel}企业：\n\n${top20Tags}\n\n</output>（注意：以上内容包含自定义组件标签，请原样输出，不要替换为go标签或其他标签）`;
      } catch (error: any) {
        logger.error(
          `企业上下游Top20查询失败: ${error.message}`,
          error.stack,
        );
        return '查询服务暂时不可用，请稍后重试';
      }
    },
  });
}
