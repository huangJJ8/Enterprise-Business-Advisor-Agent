/**
 * 报告数据问答工具
 * 用户提问企业财税、开票、采购、纳税、资产负债等具体数据问题时使用
 * 先校验权限，再调用 querySaasReport 和 reportInterpret 获取数据，返回给 LLM 回答
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';

export function createGetReportAnswerUserTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'get_report_answer_user',
    description: `
查询企业的详细报告数据，用于回答用户关于企业财税数据的具体问题。

使用场景（当用户询问以下类型问题时调用）：
- 企业所属行业
- 纳税等级、纳税人类型
- 近×月开票金额、开票张数、销项废票数量、销项红冲数量、开票月份数
- ×年开票总金额、×年每月开票金额
- 近12月前十大客户分析
- 近×月采购金额、采购张数、进项废票数量、进项红冲数量、采购月份数
- ×年采购总金额、×年每月采购金额
- 近12月前十大供应商分析
- 近3年已缴税额
- 历史有无欠税记录
- 近×个月纳税销售额、全部销售收入、增值税应纳税额、纳税总额、0申报月份
- 是否存在当前欠税
- ×年的资产合计、流动资产合计、非流动资产合计
- ×年的负债合计、流动负债合计、非流动负债合计
- ×年的所有者权益合计
- ×年的营业收入、营业利润、利润总额、净利润

注意：必须提供企业名称。如果用户提问中没有指定企业，需要从上下文中寻找符合用户意图的企业名称。如果都没有，请提示用户输入企业名称。
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
      question: z.string().describe('用户的原始问题，用于后续从数据中精准提取答案'),
    }),
    func: async (input) => {
      try {
        logger.log(`get_report_answer_user 开始处理，企业: ${input.enterpriseName}, 问题: ${input.question}`);

        // 1. 校验企业权限
        const verifyResult = await agentApiService.verifyEnterprise(input.enterpriseName);
        if (!verifyResult.success) {
          return verifyResult.errorMessage!;
        }
        const taxNo = verifyResult.taxNo!;
        const companyName = verifyResult.matchedName || input.enterpriseName;

        logger.log(`企业验证通过，taxNo: ${taxNo}, companyName: ${companyName}`);

        // 2. 并行调用两个接口获取数据
        const [saasResponse, rpaResponse] = await Promise.all([
          agentApiService.querySaasReport(taxNo).catch((e: any) => {
            logger.error(`querySaasReport 失败: ${e.message}`);
            return null;
          }),
          agentApiService.queryReportInterpret(taxNo).catch((e: any) => {
            logger.error(`queryReportInterpret 失败: ${e.message}`);
            return null;
          }),
        ]);

        // 3. 提取 SaaS 报告数据
        let saasData: any = null;
        if (saasResponse?.data?.success && saasResponse.data.data) {
          saasData = saasResponse.data.data;
        }

        // 4. 提取 RPA 报告数据（reportInterpret 返回的是数组 [基本信息, 发票信息, 税务信息, 风险分析]）
        let rpaData: any = null;
        if (rpaResponse?.data) {
          const rpa = rpaResponse.data;
          if (Array.isArray(rpa)) {
            rpaData = rpa;
          } else if (rpa.data && Array.isArray(rpa.data)) {
            rpaData = rpa.data;
          }
        }

        if (!saasData && !rpaData) {
          return `未能获取到${companyName}的报告数据，可能报告尚未生成，请稍后再试。`;
        }

        // 5. 组装数据返回给 LLM
        const result = buildReportData({ companyName, saasData, rpaData, question: input.question });

        logger.log(`get_report_answer_user 数据组装完成，长度: ${result.length}`);

        return result;
      } catch (error: any) {
        logger.error(`get_report_answer_user 错误: ${error.message}`);
        return `查询报告数据失败: ${error.message}`;
      }
    },
  });
}

/**
 * 组装报告数据为结构化文本，供 LLM 从中提取答案
 */
function buildReportData({
  companyName,
  saasData,
  rpaData,
  question,
}: {
  companyName: string;
  saasData: any;
  rpaData: any;
  question: string;
}): string {
  const sections: string[] = [];
  sections.push(`企业名称：${companyName}`);
  sections.push(`用户问题：${question}`);
  sections.push('---');
  sections.push('以下是该企业的报告数据，请根据用户问题从中提取准确答案：\n');

  // === SaaS 数据 ===
  if (saasData) {
    // 基本信息
    if (saasData.baseInfo) {
      sections.push('【企业基本信息】');
      sections.push(JSON.stringify(saasData.baseInfo, null, 2));
    }
    // 经营信息
    if (saasData.businessInformation) {
      sections.push('\n【经营信息】');
      sections.push(JSON.stringify(saasData.businessInformation, null, 2));
    }
    // 销项/开票分析
    if (saasData.salesAnalysis) {
      sections.push('\n【销项/开票分析】');
      sections.push(JSON.stringify(saasData.salesAnalysis, null, 2));
    }
    // 采购/进项分析
    if (saasData.purchaseAnalysis) {
      sections.push('\n【采购/进项分析】');
      sections.push(JSON.stringify(saasData.purchaseAnalysis, null, 2));
    }
    // 工商信息
    if (saasData.biz) {
      sections.push('\n【工商信息】');
      sections.push(JSON.stringify(saasData.biz, null, 2));
    }
    // 附录（含资产负债表、利润表）
    if (saasData.appendix) {
      sections.push('\n【附录-资产负债表与利润表】');
      if (saasData.appendix.taxCompanyFinanceBalanceYearList) {
        sections.push('资产负债表：');
        sections.push(JSON.stringify(saasData.appendix.taxCompanyFinanceBalanceYearList, null, 2));
      }
      if (saasData.appendix.taxCompanyFinanceProfitMonthList) {
        sections.push('利润表：');
        sections.push(JSON.stringify(saasData.appendix.taxCompanyFinanceProfitMonthList, null, 2));
      }
    }
    // 风险概览
    if (saasData.riskOverview) {
      sections.push('\n【风险概览】');
      sections.push(JSON.stringify(saasData.riskOverview, null, 2));
    }
  }

  // === RPA 数据 ===
  if (rpaData && Array.isArray(rpaData)) {
    // rpaData[0] - 基本信息
    if (rpaData[0]?.data || rpaData[0]?.basicInfo) {
      sections.push('\n【RPA-企业基本信息】');
      sections.push(JSON.stringify(rpaData[0].data || rpaData[0], null, 2));
    }
    // rpaData[1] - 发票信息（开票/采购明细）
    if (rpaData[1]?.data || rpaData[1]?.downStreamSales) {
      sections.push('\n【RPA-发票信息（开票与采购）】');
      sections.push(JSON.stringify(rpaData[1].data || rpaData[1], null, 2));
    }
    // rpaData[2] - 税务信息（增值税、税负率、财务报表）
    if (rpaData[2]?.data || rpaData[2]?.taxCharacteristics) {
      sections.push('\n【RPA-税务信息】');
      sections.push(JSON.stringify(rpaData[2].data || rpaData[2], null, 2));
    }
    // rpaData[3] - 风险分析
    if (rpaData[3]?.data || rpaData[3]?.operatingStatusAbnormality !== undefined) {
      sections.push('\n【RPA-风险分析】');
      sections.push(JSON.stringify(rpaData[3].data || rpaData[3], null, 2));
    }
  }

  return sections.join('\n');
}
