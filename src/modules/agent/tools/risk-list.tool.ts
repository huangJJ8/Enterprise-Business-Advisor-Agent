/**
 * 风险列表查询工具
 * 查询当前有哪些企业存在税务风险，返回企业名称及命中的风险大类摘要
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';

/**
 * 风险字段 → 风险大类映射（Task 2.2）
 * 简单布尔字段（值为 "1" 时命中）
 */
export const RISK_CATEGORY_MAP: Record<
  string,
  { category: string; label: string }
> = {
  fake_state_owned: { category: '企业身份风险', label: '假冒国企' },
  illegal_business: { category: '企业身份风险', label: '工商违法失信' },
  tax_illegal: { category: '企业身份风险', label: '税务违法' },
  industry_deviation: { category: '经营风险', label: '经营偏离行业' },
  circle_blacklist: { category: '企业朋友圈风险', label: '朋友圈涉黑' },
  finance_count: { category: '信用历史', label: '融资次数异常' },
} as const;

/**
 * 从单个企业风险数据中提取命中的风险大类列表（Task 2.2）
 */
export function extractRiskCategories(item: Record<string, any>): string[] {
  const categories = new Set<string>();

  // 简单布尔字段映射
  for (const [field, { category }] of Object.entries(RISK_CATEGORY_MAP)) {
    if (item[field] === '1') {
      categories.add(category);
    }
  }

  // closed_loop_trade: 非空且含 high_goods_similarity="1" → 交易结构风险
  try {
    const closedLoopTrade = item.closed_loop_trade;
    if (closedLoopTrade && closedLoopTrade !== '[]' && closedLoopTrade !== '') {
      const trades = JSON.parse(closedLoopTrade);
      if (
        Array.isArray(trades) &&
        trades.some((t: any) => t.high_goods_similarity === '1')
      ) {
        categories.add('交易结构风险');
      }
    }
  } catch {
    // JSON 解析失败时跳过
  }

  // related_party_transaction: 非空 → 交易结构风险
  try {
    const relatedParty = item.related_party_transaction;
    if (relatedParty && relatedParty !== '[]' && relatedParty !== '') {
      const transactions = JSON.parse(relatedParty);
      if (Array.isArray(transactions) && transactions.length > 0) {
        categories.add('交易结构风险');
      }
    }
  } catch {
    // JSON 解析失败时跳过
  }

  return Array.from(categories);
}


/**
 * 格式化风险列表输出，为每个企业生成交互标签和风险摘要（Task 2.3）
 */
export function formatRiskList(list: Record<string, any>[]): string {
  const lines: string[] = [
    '### 我们已对以下企业的风险信号完成扫描与汇总，请选择任一企业以查看更详细的信息：<br>',
  ];

  list.forEach((item, index) => {
    const corpName = item.corp_name || '未知企业';
    const categories = extractRiskCategories(item);
    const categorySummary =
      categories.length > 0 ? categories.join('、') : '暂无风险';

    lines.push(
      `${index + 1}、<go input="查看${corpName}的风险">${corpName}</go>`,
    );
    lines.push(`${categorySummary}<br>`);
  });

  return lines.join('\n');
}

/**
 * 创建风险列表查询工具（Task 2.1）
 */
export function createRiskListTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'risk_list',
    description: `
风险列表查询。当用户提到"风险列表"、"有哪些风险"、"风险企业"等关键词时必须调用此工具。

使用场景：
- 用户询问"当前有哪些企业存在风险"
- 用户询问"风险列表"
- 用户询问"有哪些风险企业"

功能：
获取企业税务风险列表，支持分页查询

参数：
- pageNum: 页码（默认1）

返回：企业风险列表（含风险大类摘要和交互标签），内容必须全部输出
    `.trim(),
    schema: z.object({
      pageNum: z.number().default(1).describe('页码，默认为1'),
    }),
    func: async (input) => {
      try {
        const response = await agentApiService.queryTaxRiskList({
          pageNum: input.pageNum,
          pageSize: 10,
        });

        const list = response?.data?.data;

        if(!Array.isArray(list)){
           return '暂无风险数据';
        }

        if (list.length === 0) {
          return '暂无风险数据';
        }

        const result = formatRiskList(list);
        logger.log('==风险列表工具返回结果=== ' + result);
        return result;
      } catch (error: any) {
        return `查询风险列表失败: ${error.message}`;
      }
    },
  });
}
