/**
 * 报告查询工具
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import { AgentConfig } from '../config/agent.config';
import { UserContext, UserInfo } from '../types/agent.types';
import { AuthCheckerService } from '../services/auth-checker.service';

export function createReportInterpTool({
  agentApiService,
  logger,
  config,
  userContext,
  userInfo,
  authCheckerService,
  userQuery,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
  config: AgentConfig;
  userContext: UserContext;
  userInfo: UserInfo;
  authCheckerService: AuthCheckerService;
  userQuery: string;
}) {
  return new DynamicStructuredTool({
    name: 'report_interp',
    description: `
查询企业的简明报告数据或报告解读。

使用场景：
- 用户想了解某个企业的简易报告信息
- 用户询问企业的财务、税务、开票、采购等简明信息
- 需要分析企业情况时
- 用户问"XX公司的简明报告"、"帮我分析XX企业"、"帮我生成XX企业的存客营销报告"等

⚠️ 必须从用户输入或上下文中提取企业名称作为 enterpriseName 参数传入，不能为空。

返回：企业的简明报告数据，不要做任何修饰、总结或添加额外说明
    `.trim(),
    schema: z.object({
      enterpriseName: z
        .string()
        .min(1)
        .describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
    }),
    func: async (input) => {
      try {
        // 防御性校验：确保 enterpriseName 不为空
        if (!input.enterpriseName || input.enterpriseName.trim() === '') {
          return '企业名称不能为空，请从用户输入或上下文中提取企业名称后重新调用此工具。';
        }

        // 企业验证
        const verifyResult = await agentApiService.verifyEnterprise(
          input.enterpriseName,
        );

        if (!verifyResult.success) {
          // 没有税号返回 → 企业未找到，直接返回错误信息
          if (!verifyResult.taxNo) {
            return verifyResult.errorMessage!;
          }

          // 有税号但校验未通过 → 走授权校验拦截
          const taxNo = verifyResult.taxNo;
          const authResult = await authCheckerService.checkAuthAndBuildResponse({
            orgNo: userInfo.orgNo,
            corpTaxNo: taxNo,
            enterpriseName: input.enterpriseName,
            subjectName: input.enterpriseName,
            originalQuestion: userQuery,
            operatorUserId: userInfo.id,
            operatorUserName: userInfo.name || '',
          });

          if (!authResult.hasAuth) {
            return authResult.responseMessage!;
          }

          // 授权校验通过 → 返回工商数据 + 经营收入 + 采购支出
          const [businessInfoResp, salesResult, purchaseResult] = await Promise.all([
            agentApiService.getBasicInformation(taxNo),
            agentApiService.querySalesReport(taxNo),
            agentApiService.queryPurchaseReport(taxNo),
          ]);

          const parts: string[] = [];
          const companyInfo = businessInfoResp?.data?.data?.companyInfo;

          // 基本信息
          if (companyInfo) {
            parts.push(
              `*以下为该企业的基本信息，请从注册信息、经营状态等角度进行概述*\n${JSON.stringify(companyInfo)}`,
            );
          }

          // 经营收入
          if (salesResult.success && salesResult.data) {
            parts.push(
              `*以下为该企业的经营收入数据，请从收入规模、客户分布、开票趋势等角度进行分析*\n${JSON.stringify(salesResult.data)}`,
            );
          }

          // 采购支出
          if (purchaseResult.success && purchaseResult.data) {
            parts.push(
              `*以下为该企业的采购支出数据，请从采购规模、供应商分布等角度进行分析*\n${JSON.stringify(purchaseResult.data)}`,
            );
          }

          // 主营商品
          const salesCommodity =
            salesResult.data?.sales?.salesCommodity ||
            salesResult.data?.salesCommodity ||
            salesResult.data?.salesAnalysis?.salesCommodity;
          const mainRevenueList: any[] =
            salesCommodity?.mainRevenueList || [];

          if (mainRevenueList.length > 0) {
            const yearCountTotals: Record<string, number> = {};
            for (const item of mainRevenueList) {
              const y = item.year || '未知';
              yearCountTotals[y] =
                (yearCountTotals[y] || 0) +
                Number(item.transactionCount || 0);
            }

            const productLines = mainRevenueList.map((item: any) => {
              const amount = item.salesAmount || item.purchaseAmount || '--';
              const total = yearCountTotals[item.year] || 0;
              const countRate =
                total > 0 && item.transactionCount
                  ? (
                      (Number(item.transactionCount) / total) *
                      100
                    ).toFixed(2)
                  : '--';
              return `${item.year || '--'}年｜商品：${item.commodityType || '--'}｜金额：${amount}万元｜金额占比：${item.amountPercentage || '--'}%｜出现次数：${item.transactionCount || '--'}次｜次数占比：${countRate}%`;
            });

            parts.push(
              `*以下为该企业的主营商品信息，请从产品结构、商品竞争力等角度进行总结*\n${productLines.join('\n')}`,
            );
          } else if (companyInfo?.scope) {
            parts.push(
              `*以下为该企业的主营商品信息，请从产品结构、商品竞争力等角度进行总结*\n${companyInfo.scope}`,
            );
          }

          return parts.length > 0
            ? parts.join('\n\n')
            : '已通过授权校验，但未查询到相关数据';
        }

        // verifyEnterprise 校验通过 → 原有逻辑
        const taxNo = verifyResult.taxNo!;

        const response = await agentApiService.querySaasReport(taxNo);

        const saasReport = response.data || {};

        if (!saasReport.success) {
          return saasReport.message || '未找到该企业的报告数据';
        }

        const { answer } = buildData({ data: saasReport.data });

        const companyName = saasReport.data?.baseInfo?.companyName;

        logger.log('answer: ' + answer);

        // const aiReportResponse = await agentApiService.queryAiReport(taxNo);

        // const iframelink = aiReportResponse.data.toString();

        // logger.log('iframelink: ' + iframelink);

        // // 检查机构号是否在产品匹配白名单中
        // const isInWhitelist = config.productMatchWhitelist.includes(
        //   userContext.orgNo,
        // );

        // logger.log(
        //   `机构号 ${userContext.orgNo} 产品匹配白名单检查: ${isInWhitelist}`,
        // );

        // // 根据白名单决定是否显示产品匹配
        // const productMatchLine = isInWhitelist
        //   ? `<g1 input="对${companyName}进行产品匹配">产品匹配</g1>`
        //   : '';

        // <iframelink input="${iframelink}">报告详情（UI版）- 无AI小结</iframelink>\n\n

        const result = `
${answer.trim()}\n\n\n
<g1 input="查看${companyName}报告详情">报告详情</g1>（以上内容原样输出，不能删除或者省略各类标签）\n\n
`;

        logger.log('result: ' + result);

        return result.trim();
      } catch (error: any) {
        logger.error('error: ' + error);
        return `查询报告失败: ${error.message}`;
      }
    },
  });
}

function buildData({ data }: { data: any }) {
  try {
    const { baseInfo: a = {}, businessInformation: b = {} } = data;

    let answer = `${a.companyName}，`;
    answer += `注册资本${a.registCapi}万元，`;
    answer += `成立时间为${a.startDate}，`;
    answer += `法定代表⼈为${a.operName}，`;
    answer += a.changeData ? `企业24个月内${a.changeData}法人、股东变更。` : '';
    answer += a.type ? `企业为${a.type}` : '';
    answer += `企业纳税⼈类型为${a.taxpayerType}，2024年纳税信⽤等级为${a.creditLevel}级。\n\n`;
    answer += `\n\n<br/>`;
    answer += `企业所在行业为${b.industry}，`;
    answer += `在行业内排名约为${
      (b.countryIndustryRank || b.countryIndustryRank === 0) &&
      b.countryIndustryRank + '%'
    }。`;
    answer += `上游供应商集中度${b.upstreamSuppliersConcentration}，`;
    answer += `下游客户集中度${b.downstreamSuppliersConcentration}，`;
    answer += `上年度开票销售收入${b.preYearInvoiceSales}万元，`;
    answer += `发票趋势${b.invoiceTrends}；`;
    answer += `企业主营产品${b.mainProductsStability}，`;
    answer += `产品竞争力${b.productCompetitiveness}；`;
    answer += `主要客户实力${b.mainCustomersStrength}，`;
    answer += `销售市场${b.salesMarketStability}；`;
    answer += `主要供应商${b.keySuppliersStability}，`;
    answer += `整体实力${b.overallStrength}，`;
    answer += `供应链稳定性${b.supplyChainStability}；`;
    answer += `企业财税状况${b.companyFinancialTax}；`;
    answer += `${
      b.longLending === '有'
        ? '存在多头借贷情况，需重点关注'
        : '不存在多头借贷情况'
    }。`;

    return {
      answer,
    };
  } catch (error: any) {
    return {
      answer: error.message,
    };
  }
}
