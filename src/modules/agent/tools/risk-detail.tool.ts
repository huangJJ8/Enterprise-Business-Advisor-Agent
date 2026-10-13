/**
 * 风险详情查询工具
 * 查看某个企业的详细风险报告，按风险维度分类展示
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import { UserInfo } from '../types/agent.types';
import { AuthCheckerService } from '../services/auth-checker.service';

/** 简单布尔字段 → 风险维度 + 描述 */
const DETAIL_FIELD_MAP: Record<
  string,
  { dimension: string; description: string }
> = {
  fake_state_owned: { dimension: '企业身份风险', description: '是被国资委列示的假冒国企' },
  illegal_business: { dimension: '企业身份风险', description: '是工商严重违法失信黑名单' },
  tax_illegal: { dimension: '企业身份风险', description: '是税务违法黑名单' },
  industry_deviation: { dimension: '经营风险', description: '开票商品行业与注册行业不符' },
  circle_blacklist: { dimension: '朋友圈风险', description: '朋友圈有多个企业命中黑名单' },
  finance_count: { dimension: '信用历史', description: '近6个月申请融资次数大于5次' },
};

/** 五个风险维度的固定顺序 */
const DIMENSION_ORDER = [
  '企业身份风险',
  '经营风险',
  '交易结构风险',
  '朋友圈风险',
  '信用历史',
];

/**
 * 安全解析 JSON 字符串，失败时返回空数组
 */
function safeParseJsonArray(jsonStr: any): any[] {
  if (!jsonStr || jsonStr === '' || jsonStr === '[]') return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 格式化风险报告数据为按维度分类的 Markdown 文本（Task 3.2）
 */
export function formatRiskDetail(data: Record<string, any>): string {
  const corpName = data.corp_name || '未知企业';

  // 按维度收集风险描述
  const dimensionItems: Record<string, string[]> = {};
  for (const dim of DIMENSION_ORDER) {
    dimensionItems[dim] = [];
  }

  // 1. 简单布尔字段
  for (const [field, { dimension, description }] of Object.entries(DETAIL_FIELD_MAP)) {
    if (data[field] === '1') {
      dimensionItems[dimension].push(description);
    }
  }

  // 2. 闭环交易 → 交易结构风险（仅保留 high_goods_similarity="1"）
  const closedLoopTrades = safeParseJsonArray(data.closed_loop_trade);
  for (const trade of closedLoopTrades) {
    if (trade.high_goods_similarity === '1') {
      const traderName = (trade.trader_name || '').replace(/,/g, '、');
      dimensionItems['交易结构风险'].push(
        `与${traderName}存在发票闭环且开票商品类别相似度高`,
      );
    }
  }

  // 3. 关联交易 → 交易结构风险（完整展示 trade_mode、trader_name、l12_trade_ratio）
  const relatedTransactions = safeParseJsonArray(data.related_party_transaction);
  for (const tx of relatedTransactions) {
    const traderName = (tx.trader_name || '').replace(/,/g, '、');
    const tradeMode = tx.trade_mode || '';
    const ratio = tx.l12_trade_ratio;
    const parts: string[] = [];
    if (traderName && tradeMode) {
      parts.push(`与${traderName}为交易双方有${tradeMode}关系`);
    }
    if (ratio) {
      parts.push(`近12个月交易金额占目标企业交易总额比例高（≥${ratio}%）`);
    }
    if (parts.length) {
      dimensionItems['交易结构风险'].push(parts.join('，'));
    }
  }

  // 组装输出
  const lines: string[] = [`### 针对${corpName}，提取的风险内容如下：`];
  let index = 1;

  for (const dim of DIMENSION_ORDER) {
    const items = dimensionItems[dim];
    if (items.length === 0) continue;

    lines.push(`${index}. **${dim}**：`);
    for (const item of items) {
      lines.push(`- ${item}；`);
    }
    index++;
  }

  // 如果没有任何风险项
  if (index === 1) {
    return `### 针对${corpName}，暂未发现风险信息。`;
  }

  return lines.join('\n');
}

/**
 * 创建风险详情查询工具（Task 3.1）
 */
export function createRiskDetailTool({
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
    name: 'risk_detail',
    description: `
风险详情查询。当用户提到"查看XX企业风险"、"XX企业的风险详情"等关键词时必须调用此工具。

使用场景：
- 用户询问"查看XX企业的风险"
- 用户询问"XX企业的风险详情"

功能：
查看某个企业的详细风险报告，按风险维度分类展示

返回：按风险维度分类的详细风险信息，内容必须全部输出
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
    }),
    func: async (input) => {
      try {
        // 内部自动完成企业验证和权限校验
        const verifyResult = await agentApiService.verifyEnterprise(input.enterpriseName);
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

        const response = await agentApiService.getRiskReport(taxNo);

        const rawData = response?.data?.data;

        // 检查是否包含"无该报告查看权限"
        const rawStr = typeof rawData === 'string' ? rawData : JSON.stringify(rawData || '');
        if (rawStr.includes('无该报告查看权限')) {
          return '暂无查看权限，请通过链接或二维码进行采集后查看';
        }

        // 解析数据
        let data: Record<string, any>;
        if (typeof rawData === 'string') {
          try {
            data = JSON.parse(rawData);
          } catch {
            return '暂无风险数据';
          }
        } else if (rawData && typeof rawData === 'object') {
          data = rawData;
        } else {
          return '暂无风险数据';
        }

        const result = formatRiskDetail(data);
        logger.log('==风险详情工具返回结果=== ' + result);
        return result;
      } catch (error: any) {
        return `查询风险详情失败: ${error.message}`;
      }
    },
  });
}
