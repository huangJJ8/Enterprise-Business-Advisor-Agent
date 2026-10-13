/**
 * 年报查询工具 - Acme 科技(00000.HK) 2025年年报数据（示例数据，均为虚构）
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// ⚠️ 本工具内的所有财务数据均为演示用虚构数据，不对应任何真实企业。
const ANNUAL_REPORT_DATA = {
  company: 'Acme 科技股份有限公司',
  stock_code: '00000.HK',
  report_period: '2025-01-01 ~ 2025-12-31',
  currency: 'CNY',
  unit: '元',
  key_indicators: {
    per_share: [
      { item: '基本每股收益', '2025': -0.06, '2024': -0.44 },
      { item: '稀释每股收益', '2025': -0.06, '2024': -0.44 },
      { item: 'TTM每股收益', '2025': -0.05, '2024': -0.38 },
      { item: '每股净资产', '2025': 3.15, '2024': 2.71 },
      { item: '每股经营现金流', '2025': 0.45, '2024': 0.21 },
      { item: '每股营业收入', '2025': 3.8, '2024': 3.4 },
    ],
    profitability: [
      { item: '经调整净利润（非IFRS）', '2025': 15000000, '2024': -28000000 },
      { item: '营业总收入', '2025': 456000000, '2024': 408000000 },
      { item: '营业总收入同比增长(%)', '2025': 11.76, '2024': -6.2 },
      { item: '营业总收入滚动环比增长(%)', '2025': 0.0, '2024': 0.03 },
      { item: '毛利润', '2025': 182000000, '2024': 158000000 },
      { item: '毛利润同比增长(%)', '2025': 15.19, '2024': -5.1 },
      { item: '毛利润滚动环比增长(%)', '2025': 0.0, '2024': -9.8 },
      { item: '归母净利润', '2025': -7800000, '2024': -52650000 },
      { item: '归母净利润同比增长(%)', '2025': 85.18, '2024': -25.0 },
      { item: '归母净利润滚动环比增长(%)', '2025': 0.0, '2024': 5.2 },
    ],
    profit_quality: [
      { item: '所得税/利润总额(%)', '2025': -3.9, '2024': -0.38 },
      { item: '经营现金流/营业收入(%)', '2025': 11.8, '2024': 6.2 },
    ],
    return_on_investment: [
      { item: '平均净资产收益率(%)', '2025': -2.22, '2024': -20.5 },
      { item: '年化净资产收益率(%)', '2025': -2.22, '2024': -20.5 },
      { item: '总资产净利率(%)', '2025': -1.44, '2024': -9.8 },
      { item: '毛利率(%)', '2025': 39.91, '2024': 38.73 },
      { item: '净利率(%)', '2025': -1.75, '2024': -12.93 },
      { item: '年化投资回报率(%)', '2025': -1.6, '2024': -10.5 },
    ],
    operating_capacity: [
      { item: '应收账款周转率(次)', '2025': 3.8, '2024': 3.2 },
      { item: '存货周转率(次)', '2025': 15.2, '2024': 13.4 },
      { item: '流动资产周转率(次)', '2025': 0.95, '2024': 0.88 },
      { item: '总资产周转率(次)', '2025': 0.8, '2024': 0.75 },
    ],
    financial_risk: [
      { item: '流动比率(倍)', '2025': 3.43, '2024': 3.38 },
      { item: '流动负债/总负债(%)', '2025': 69.76, '2024': 64.67 },
    ],
    asset_structure: [
      { item: '资产负债率(%)', '2025': 35.16, '2024': 38.53 },
      { item: '权益乘数', '2025': 1.54, '2024': 1.63 },
      { item: '产权比率', '2025': 0.54, '2024': 0.63 },
    ],
  },
  balance_sheet: [
    { item: '物业、厂房及设备', '2025_end': 12000000, '2024_end': 11000000 },
    { item: '无形资产', '2025_end': 25000000, '2024_end': 22000000 },
    { item: '于联营公司的投资', '2025_end': 8000000, '2024_end': 7500000 },
    { item: '于合营企业的投资', '2025_end': 3000000, '2024_end': 2800000 },
    {
      item: '按公平值计量且其变动计入损益的金融资产(非流动)',
      '2025_end': 45000000,
      '2024_end': 40000000,
    },
    { item: '非流动资产合计', '2025_end': 93000000, '2024_end': 83300000 },
    { item: '存货', '2025_end': 18000000, '2024_end': 16000000 },
    {
      item: '贸易及其他应收款项、按金及预付款项',
      '2025_end': 120000000,
      '2024_end': 105000000,
    },
    { item: '应收关联方款项', '2025_end': 5000000, '2024_end': 4200000 },
    { item: '受限制银行存款', '2025_end': 2000000, '2024_end': 1800000 },
    { item: '现金及现金等价物', '2025_end': 260000000, '2024_end': 230000000 },
    { item: '短期银行存款(三个月以上)', '2025_end': 15000000, '2024_end': 12000000 },
    {
      item: '按公平值计量且其变动计入损益的金融资产(流动)',
      '2025_end': 30000000,
      '2024_end': 26000000,
    },
    { item: '合同资产', '2025_end': 22000000, '2024_end': 20000000 },
    { item: '流动资产合计', '2025_end': 490000000, '2024_end': 444800000 },
    { item: '资产合计', '2025_end': 583000000, '2024_end': 528100000 },
    { item: '贸易及其他应付款项', '2025_end': 60000000, '2024_end': 55000000 },
    { item: '应付税项', '2025_end': 3000000, '2024_end': 2500000 },
    { item: '应付关联方款项', '2025_end': 4000000, '2024_end': 3600000 },
    { item: '租赁负债(流动)', '2025_end': 6000000, '2024_end': 5500000 },
    {
      item: '按公平值计量且其变动计入损益的金融负债',
      '2025_end': 0,
      '2024_end': 0,
    },
    { item: '合约负债', '2025_end': 70000000, '2024_end': 65000000 },
    { item: '流动负债合计', '2025_end': 143000000, '2024_end': 131600000 },
    { item: '租赁负债(非流动)', '2025_end': 10000000, '2024_end': 9500000 },
    { item: '非流动负债合计', '2025_end': 62000000, '2024_end': 71900000 },
    { item: '负债合计', '2025_end': 205000000, '2024_end': 203500000 },
    { item: '非控股权益', '2025_end': -3000000, '2024_end': -2800000 },
    { item: '净资产', '2025_end': 378000000, '2024_end': 324600000 },
    { item: '股本', '2025_end': 120000000, '2024_end': 120000000 },
    { item: '储备', '2025_end': 261000000, '2024_end': 207400000 },
    {
      item: '本公司拥有人应占权益',
      '2025_end': 381000000,
      '2024_end': 327400000,
    },
    { item: '权益总额', '2025_end': 378000000, '2024_end': 324600000 },
    {
      item: '权益总额及非流动负债',
      '2025_end': 440000000,
      '2024_end': 396500000,
    },
  ],
  income_statement: [
    { item: '营运收入合计', '2025': 456000000, '2024': 408000000 },
    { item: '销售成本', '2025': 274000000, '2024': 250000000 },
    { item: '毛利', '2025': 182000000, '2024': 158000000 },
    { item: '其他收入', '2025': 3000000, '2024': 2400000 },
    { item: '其他收益及亏损,净额', '2025': -1500000, '2024': -1200000 },
    { item: '分销及销售开支', '2025': 62000000, '2024': 58000000 },
    { item: '行政开支', '2025': 48000000, '2024': 46000000 },
    { item: '预估减值亏损信用损失,扣除拨回', '2025': 0, '2024': 0 },
    { item: '研发开支', '2025': 96000000, '2024': 90000000 },
    { item: '扣除拨回', '2025': 1000000, '2024': 900000 },
    { item: '经营亏损', '2025': -21500000, '2024': -33900000 },
    { item: '财务收入', '2025': 2500000, '2024': 2200000 },
    { item: '财务成本', '2025': 400000, '2024': 350000 },
    { item: '应占联营公司及合营企业业绩', '2025': -300000, '2024': -500000 },
    {
      item: '按公平值计量且其变动计入损益的金融资产及负债的公平值变动',
      '2025': 12000000,
      '2024': -20000000,
    },
    { item: '除税前亏损', '2025': -7700000, '2024': -52550000 },
    { item: '所得税开支', '2025': 300000, '2024': 200000 },
    { item: '持续经营业务税后利润', '2025': -8000000, '2024': -52750000 },
    { item: '除税后溢利:年内亏损', '2025': -8000000, '2024': -52750000 },
    { item: '除税后溢利:非控股权益', '2025': -200000, '2024': -100000 },
    { item: '除税后溢利:本公司拥有人', '2025': -7800000, '2024': -52650000 },
    { item: '每股基本盈利', '2025': -0.06, '2024': -0.44 },
    { item: '每股摊薄盈利', '2025': -0.06, '2024': -0.44 },
    { item: '其他全面收益总额', '2025': -150000, '2024': 0 },
    {
      item: '全面收益:年内全面开支总额',
      '2025': -8150000,
      '2024': -52750000,
    },
    { item: '全面收益:非控股权益', '2025': -200000, '2024': -100000 },
    { item: '全面收益:本公司拥有人', '2025': -7950000, '2024': -52650000 },
  ],
};

function formatAmount(value: number | null): string {
  if (value === null || value === undefined) return '--';
  const absVal = Math.abs(value);
  if (absVal >= 100000000) {
    return `${(value / 100000000).toFixed(2)}亿`;
  }
  if (absVal >= 10000) {
    return `${(value / 10000).toFixed(2)}万`;
  }
  return `${value}`;
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '--';
  return `${value}%`;
}

function formatValue(value: number | null): string {
  if (value === null || value === undefined) return '--';
  return `${value}`;
}

type IndicatorItem = {
  item: string;
  '2025': number | null;
  '2024': number | null;
};

function buildIndicatorSection(
  title: string,
  items: IndicatorItem[],
  isPercent = false,
): string {
  const lines: string[] = [`【${title}】`];
  for (const row of items) {
    const fmt =
      row.item.includes('%') ||
      row.item.includes('倍') ||
      row.item.includes('次') ||
      isPercent
        ? (v: number | null) => formatValue(v)
        : (v: number | null) =>
            typeof v === 'number' && Math.abs(v) >= 10000
              ? formatAmount(v)
              : formatValue(v);
    lines.push(
      `${row.item}：2025年 ${fmt(row['2025'])}，2024年 ${fmt(row['2024'])}`,
    );
  }
  return lines.join('\n');
}

function buildKeyIndicators(): string {
  const ki = ANNUAL_REPORT_DATA.key_indicators;
  const sections = [
    buildIndicatorSection('每股指标', ki.per_share),
    buildIndicatorSection('盈利能力', ki.profitability),
    buildIndicatorSection('利润质量', ki.profit_quality),
    buildIndicatorSection('投资回报', ki.return_on_investment),
    buildIndicatorSection('运营能力', ki.operating_capacity),
    buildIndicatorSection('财务风险', ki.financial_risk),
    buildIndicatorSection('资产结构', ki.asset_structure),
  ];
  return sections.join('\n\n');
}

function buildIncomeStatement(): string {
  const lines: string[] = [];
  for (const row of ANNUAL_REPORT_DATA.income_statement) {
    const val2025 = row['2025'];
    const val2024 = row['2024'];
    if (row.item.includes('每股') || row.item.includes('摊薄')) {
      lines.push(
        `${row.item}：2025年 ${formatValue(val2025)}，2024年 ${formatValue(val2024)}`,
      );
    } else {
      const changeRate =
        val2024 !== 0 && val2024 !== null && val2025 !== null
          ? (((val2025 - val2024) / Math.abs(val2024)) * 100).toFixed(2) + '%'
          : '--';
      lines.push(
        `${row.item}：2025年 ${formatAmount(val2025)}，2024年 ${formatAmount(val2024)}，同比变动 ${changeRate}`,
      );
    }
  }
  return lines.join('\n');
}

function buildBalanceSheet(): string {
  const lines: string[] = [];
  for (const row of ANNUAL_REPORT_DATA.balance_sheet) {
    const val2025 = row['2025_end'];
    const val2024 = row['2024_end'];
    const changeRate =
      val2024 !== 0 && val2024 !== null && val2025 !== null
        ? (((val2025 - val2024) / Math.abs(val2024)) * 100).toFixed(2) + '%'
        : '--';
    lines.push(
      `${row.item}：2025年末 ${formatAmount(val2025)}，2024年末 ${formatAmount(val2024)}，同比变动 ${changeRate}`,
    );
  }
  return lines.join('\n');
}

export function createAnnualReportTool() {
  return new DynamicStructuredTool({
    name: 'annual_report',
    description: `
查询Acme 科技股份有限公司（00000.HK）的2025年年报数据，包括关键指标、利润表、资产负债表。

使用场景：
- 用户询问"Acme 科技的年报"、"Acme的财报"、"Acme 科技财务数据"
- 用户询问Acme 科技的营收、利润、亏损、资产、负债等财务指标
- 用户询问Acme 科技的收入、成本、毛利、研发费用等具体科目
- 用户询问Acme 科技的每股收益、毛利率、净利率、ROE等关键指标
- 用户询问Acme 科技的资产负债率、流动比率等财务风险指标
- 用户提到"00000"或"Acme"并涉及财务/年报相关问题

参数：
- query_type: 查询类型（可选），支持 all/indicators/income/balance，默认 all

返回：格式化的年报数据
    `.trim(),
    schema: z.object({
      query_type: z
        .enum(['all', 'indicators', 'income', 'balance'])
        .optional()
        .describe(
          '查询类型：all=全部报表，indicators=关键指标，income=利润表，balance=资产负债表，默认all',
        ),
    }),
    func: async (input) => {
      const queryType = input.query_type || 'all';
      const { company, stock_code, report_period } = ANNUAL_REPORT_DATA;

      let result = `### ${company}（${stock_code}）年度报告\n`;
      result += `报告期间：${report_period}\n\n`;

      if (queryType === 'all' || queryType === 'indicators') {
        result += `关键财务指标\n${buildKeyIndicators()}\n\n`;
      }

      if (queryType === 'all' || queryType === 'income') {
        result += `利润表\n${buildIncomeStatement()}\n\n`;
      }

      if (queryType === 'all' || queryType === 'balance') {
        result += `资产负债表\n${buildBalanceSheet()}\n\n`;
      }

      result += `\n【回答要求】
你是一位资深财务分析师，请基于以上数据回答用户问题。严格遵循以下要求：

【内容要求】
1. 先给出一句话总结性结论（需提及经调整净利润扭亏为盈这一核心亮点），再展开分析。
2. 总结性结论之后，第一个分析模块必须是“## 经调整净利润分析”，从盈利视角切入，自然承接总结结论。该模块需要：解释经调整净利润与IFRS归母净利润的差异及原因（如剔除股份支付、公允价值变动等非经常性项目）；强调本期经调整净利润扭亏为盈的里程碑意义；分析扭亏背后的核心驱动力（收入增长、费用管控、业务结构优化等）；说明该指标对评估公司真实经营能力的参考价值。该模块字数不少于300字。
3. 后续再分模块深入解读营收、费用、资产负债等，每个模块要包含：核心数据引用、同比变化趋势、背后的业务逻辑或原因推断。
4. 数据自然穿插在分析中，格式如“营收4.56亿元（同比+11.8%）”，不要单独罗列数据。
5. 对关键变化要给出“为什么”的分析，比如亏损收窄的驱动因素、费用下降的可能原因。
6. 每个模块的分析控制在200-400字，内容要有深度，不说废话。

【格式要求 - 严格执行】
1. 每个分析模块必须使用 ## 作为标题，例如：## 营收与盈利分析、## 费用控制与运营效率。
2. 模块内部要点使用 - 列表格式，每个要点一段分析。
3. 关键数据和关键结论使用 **加粗** 强调。
4. 每个模块的分析文字之前，必须附上该模块相关的核心数据清单，用 - 列表换行展示，每行一个指标，格式如：
   - 营业收入：2025年 4.56亿元，2024年 4.08亿元，同比 +11.8%
   - 毛利：2025年 1.82亿元，2024年 1.58亿元，同比 +15.2%
   每个模块选取3-6个最相关的指标即可。
5. 最后用 ## 总结与展望 给出综合评价和风险提示，前瞻性判断标明"预计"或"推测"。
6. 禁止使用Markdown表格（| --- | 格式），所有数据对比一律用 - 列表换行文本展示。

【回答风格】
- 像一位分析师在做路演讲解，专业但通俗，有观点有判断。
- 不要说"根据数据显示"这类废话开头，直接切入分析。
- 必须使用 <g1> 标签作为引导，引导内容必须是与年报数据相关，例如：<g1 input="Acme 科技2025年资产负债率">Acme 科技2025年资产负债率</g1>。`;

      return result;
    },
  });
}
