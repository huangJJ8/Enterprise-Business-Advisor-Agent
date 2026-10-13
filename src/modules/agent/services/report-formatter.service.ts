/**
 * 格式化报告服务
 * 从 BFF 移植 handleReportDetail + handleReportDetailToMarkdown
 * 将原始报告解读数据转换为结构化 Markdown
 */
import { Injectable, Inject } from '@nestjs/common';
import { LoggerService } from 'src/modules-global/logger/service';

@Injectable()
export class ReportFormatterService {
  @Inject(LoggerService)
  private readonly logger!: LoggerService;

  /**
   * 处理报告详情原始数据
   * 移植自 BFF ChatflowService.handleReportDetail
   * @param res queryReportInterpret 返回的原始数据
   * @returns { data: any[] } 或 { error: string }
   */
  handleReportDetail(res: any = {}): { data?: any[]; error?: string } {
    const riskList: Record<string, { target: string; hitNot: string; rskLevel: string; targetDescription: string }> = {
      operatingStatusAbnormality: {
        target: '经营状态异常', hitNot: '', rskLevel: '高',
        targetDescription: '当前经营状态包括注销/吊销/迁出',
      },
      operatingInterruption: {
        target: '经营中断', hitNot: '', rskLevel: '高',
        targetDescription: '最晚一张有效发票时间至今间隔天数>=90天',
      },
      operatingActivityDeclineL6M: {
        target: '经营活跃度下降（近6月）', hitNot: '√', rskLevel: '中',
        targetDescription: '近1月-近6月有效开票月份数同比下降',
      },
      operatingActivityDeclineL3M: {
        target: '经营活跃度下降（近3月）', hitNot: '', rskLevel: '中',
        targetDescription: '近1月-近3月有效开票天数环比下降',
      },
      incomeSurge: {
        target: '收入徒增', hitNot: '', rskLevel: '高',
        targetDescription: '近1月有效票金额/近2月-近13月均有效票金额>1.5',
      },
      incomeDeclineL12M: {
        target: '收入下滑（近12月）', hitNot: '√', rskLevel: '高',
        targetDescription: '近12个月月均有效票金额/近24个月月均有效票金额<0.5',
      },
      incomeDeclineL6M: {
        target: '收入下滑（近6月）', hitNot: '', rskLevel: '高',
        targetDescription: '近6个月月均有效票金额/近12个月月均有效票金额<0.5',
      },
      incomeDeclineL3M: {
        target: '收入下滑（近3月）', hitNot: '', rskLevel: '高',
        targetDescription: '近3个月月均有效票金额/近12个月月均有效票金额<0.5',
      },
      incomeFluctuation: {
        target: '收入波动', hitNot: '√', rskLevel: '低',
        targetDescription: '近1月-近6月有效票金额变异系数较小',
      },
      mainBusinessException: {
        target: '主营业务异常', hitNot: '', rskLevel: '高',
        targetDescription: '近6个月第一大商品有效票金额环比增加/降低超20%',
      },
      transactionAmountConcentration: {
        target: '交易金额集中', hitNot: '√', rskLevel: '高',
        targetDescription: '近1月-近12月前30%有效票开票金额的总和占全部有效票开票金额总和的比率>0.9',
      },
      mainProductValueReduction: {
        target: '主营商品价值降低', hitNot: '', rskLevel: '中',
        targetDescription: '近1月-近6月第一大商品单价（商品大类）环比下降超10%',
      },
      productSalesVarietyReduction: {
        target: '商品销售种类减少', hitNot: '√', rskLevel: '中',
        targetDescription: '近1月-近12月商品种类减少数量占比（商品大类）',
      },
      keyCustomerLoss: {
        target: '重要客户流失', hitNot: '√', rskLevel: '高',
        targetDescription: '近6月存在前十大客户流失（近7月-近18月为前十大客户，近1月-近6月未发生交易客户）',
      },
      materialPurchaseInterruption: {
        target: '原材料采购中断', hitNot: '', rskLevel: '高',
        targetDescription: '存在进项发票金额为0',
      },
      keyCustomerReturn: {
        target: '重要客户退货', hitNot: '', rskLevel: '高',
        targetDescription: '近1月-近12月收入占比超过5%的客户，在近1月-近3月发生作废或红冲的客户占比',
      },
      productQualityStabilityRisk: {
        target: '商品质量稳定性差', hitNot: '', rskLevel: '中',
        targetDescription: '近6个月红冲占比超过20%的月份数',
      },
      terminationRisk: {
        target: '终止经营风险', hitNot: '', rskLevel: '高',
        targetDescription: '最晚一张有效发票至今间隔天数>180天',
      },
    };

    try {
      const str = JSON.stringify(res)
        .replace(/-99999(\.0+)?/g, '--')
        .replace(/\bnull\b/g, '"--"');

      // 递归清理所有 key/value 的首尾空格（兼容 mock 数据中 key 带空格的情况）
      const parsed = JSON.parse(str, (_key, value) => {
        if (typeof value === 'string') return value.trim();
        return value;
      });
      // 重新序列化再解析，确保 key 也被 trim
      const cleanStr = JSON.stringify(parsed, (_key, value) => value);
      const trimKeys = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(trimKeys);
        if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [k, v] of Object.entries(obj)) {
            result[k.trim()] = trimKeys(v);
          }
          return result;
        }
        return obj;
      };
      const cleaned = trimKeys(JSON.parse(cleanStr));

      const arr: any[] = cleaned.map((item: any) => item.data);
      const maps = arr[1];
      const risk = arr[3];

      if (maps) {
        for (const item of ['downStreamSales', 'upStreamPurchases']) {
          const temp = maps[item].map((child: any) => ({
            peroid: child.peroid,
            ...child.value,
          }));
          temp.push(temp.shift());
          maps[item] = temp;
        }
      }

      if (!risk) {
        return { error: '风险数据异常' };
      }

      const riskItems = Object.keys(risk)
        .map((key) => {
          if (risk[key] === '是') {
            return { ...riskList[key], hitNot: '是' };
          }
          return undefined;
        })
        .filter(Boolean);

      arr[3] = riskItems;

      return { data: arr };
    } catch (error: any) {
      this.logger.error(`handleReportDetail error: ${error.message}`);
      return { error: error.message || '报告详情处理失败' };
    }
  }

  /**
   * 将处理后的报告数据转换为 Markdown 格式
   * 移植自 BFF handleReportDetailToMarkdown
   * @param data handleReportDetail 返回的 data 数组
   */
  handleReportDetailToMarkdown(data: any[]): string {
    const [basicInfoData, salesPurchaseData, taxFinanceData, businessRiskData] = data;
    const basic = basicInfoData?.basicInfo || {};
    const sales = salesPurchaseData || {};
    const tax = taxFinanceData || {};
    const risk = businessRiskData || [];

    const safeVal = (v: any, suffix = '') => (v != null && v !== '' ? `${v}${suffix}` : '--');

    // 辅助：从数组中按 index 取字段值
    const getStreamVal = (arr: any[] | undefined, idx: number, key: string) =>
      arr && arr[idx] && arr[idx][key] !== undefined ? arr[idx][key] : '--';

    // ===================== 1. 基础信息 =====================
    let report = `# 企业报告详情

## 一、基本信息
- 企业名称：${safeVal(basic.taxName)}
- 成立时间：${safeVal(basic.registerDate)}
- 注册地址：${safeVal(basic.registerAddress)}
- 统一社会信用代码：${safeVal(basic.taxNo)}
- 企业类型：${safeVal(basic.registeredType)}
- 法定代表人：${safeVal(basic.legalPerson)}
- 注册资本：${safeVal(basic.registerCapital, ' 元')}
- 企业状态：${safeVal(basic.status)}
- 所属行业：${safeVal(basic.industry)}
- 纳税人等级：${safeVal(basic.creditLevel)}
- 纳税人类型：${safeVal(basic.taxType)}

## 二、下游销售

### （一）开票对比分析

| 开票对比维度 | 近 3 个月 | 近 6 个月 | 近 9 个月 | 近 12 个月 | 近 1 个月 |
| ---- | ---- | ---- | ---- | ---- | ---- |
`;

    const downKeys = [
      { label: '开票金额（元）', key: 'validAmountTax' },
      { label: '同比（%）', key: 'amountTaxTb' },
      { label: '环比（%）', key: 'amountTaxHb' },
      { label: '发票张数', key: 'validCount' },
      { label: '0 开票月份', key: 'nonBillingMonths' },
      { label: '废票数量', key: 'invalidCount' },
      { label: '红冲数量', key: 'negativeCount' },
      { label: '企业开票稳定性', key: 'coefNumber' },
      { label: '开票月份数', key: 'billingMonths' },
      { label: '下游客户数量', key: 'downCorps' },
      { label: '最大连续未开票间隔天数（销项）', key: 'maxInterval' },
      { label: '废票金额占比（%）', key: 'invalidAmountRate' },
      { label: '红冲金额占比（%）', key: 'negativeAmountRate' },
      { label: 'top1 大客户开票金额占比（%）', key: 'top1AmountRate' },
      { label: '前三大客户交易额占比（销项客户）（%）', key: 'top3AmountRate' },
      { label: '行业位置', key: 'industryPosition' },
    ];

    for (const { label, key } of downKeys) {
      const vals = [0, 1, 2, 3, 4].map((i) => getStreamVal(sales.downStreamSales, i, key));
      report += `| ${label} | ${vals.join(' | ')} |\n`;
    }

    // 开票金额(万元)
    report += `\n### （二）开票金额(万元)\n\n`;
    const salesYears = (sales.salesInfo || []).map((item: any) => item?.year || '--');
    report += `| 月份 | ${salesYears.join(' | ')} |\n`;
    report += `| ---- | ${salesYears.map(() => '----').join(' | ')} |\n`;
    for (let i = 0; i < 12; i++) {
      const cols = (sales.salesInfo || []).map((item: any) =>
        item?.value?.[i]?.amount ?? '--',
      );
      report += `| ${i + 1} 月 | ${cols.join(' | ')} |\n`;
    }

    // 近 12 月前十大客户
    report += `\n### （三）近 12 月前十大客户\n\n`;
    report += '| 序号 | 客户名称 | 销售金额（元） | 销售占比（%） | 是否存在关联关系 | 成立时间 | 社保参保人数 | 经营状态 | 登记注册类型 | 所在行业 |\n';
    report += '| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |\n';
    if (sales.downTopCorp && Array.isArray(sales.downTopCorp)) {
      for (const c of sales.downTopCorp) {
        report += `| ${c.rank || '--'} | ${c.customer || '--'} | ${c.amountTax || '--'} | ${c.amountTaxRate || '--'} | ${c.isTrade || '--'} | ${c.startDate || '--'} | ${c.participantsNumber || '--'} | ${c.status || '--'} | ${c.registeType || '--'} | ${c.industryName || '--'} |\n`;
      }
    }

    // ===================== 2. 上游采购 =====================
    report += `\n## 三、上游采购\n\n### （一）开票对比分析\n\n`;
    report += '| 开票对比维度 | 近 3 个月 | 近 6 个月 | 近 9 个月 | 近 12 个月 | 近 1 个月 |\n';
    report += '| ---- | ---- | ---- | ---- | ---- | ---- |\n';

    const upKeys = [
      { label: '开票金额（元）', key: 'validAmountTax' },
      { label: '同比（%）', key: 'amountTaxTb' },
      { label: '环比（%）', key: 'amountTaxHb' },
      { label: '发票张数', key: 'validCount' },
      { label: '废票数量', key: 'invalidCount' },
      { label: '红冲数量', key: 'negativeCount' },
      { label: '上游供应商数量', key: 'upStreamCorps' },
      { label: '废票金额占比（%）', key: 'invalidAmountRate' },
      { label: '红冲金额占比（%）', key: 'negativeAmountRate' },
    ];

    for (const { label, key } of upKeys) {
      const vals = [0, 1, 2, 3, 4].map((i) => getStreamVal(sales.upStreamPurchases, i, key));
      report += `| ${label} | ${vals.join(' | ')} |\n`;
    }

    // 采购金额(万元)
    report += `\n### （二）采购金额(万元)\n\n`;
    const purchaseYears = (sales.purchaseInfo || []).map((item: any) => item?.year || '--');
    report += `| 月份 | ${purchaseYears.join(' | ')} |\n`;
    report += `| ---- | ${purchaseYears.map(() => '----').join(' | ')} |\n`;
    for (let i = 0; i < 12; i++) {
      const cols = (sales.purchaseInfo || []).map((item: any) =>
        item?.value?.[i]?.amount ?? '--',
      );
      report += `| ${i + 1} 月 | ${cols.join(' | ')} |\n`;
    }

    // 近 12 月前十大供应商
    report += `\n### （三）近 12 月前十大供应商\n\n`;
    report += '| 序号 | 供应商名称 | 采购金额（元） | 采购占比（%） | 是否存在关联关系 | 成立时间 | 社保参保人数 | 经营状态 | 登记注册类型 | 所在行业 |\n';
    report += '| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |\n';
    if (sales.upTopCorp && Array.isArray(sales.upTopCorp)) {
      for (const s of sales.upTopCorp) {
        report += `| ${s.rank || '--'} | ${s.customer || '--'} | ${s.amountTax || '--'} | ${s.amountTaxRate || '--'} | ${s.isTrade || '--'} | ${s.startDate || '--'} | ${s.participantsNumber || '--'} | ${s.status || '--'} | ${s.registeType || '--'} | ${s.industryName || '--'} |\n`;
      }
    }

    // ===================== 3. 纳税相关 =====================
    const vatYears = Object.keys(tax.vatDeclared || {}).sort((a: string, b: string) => Number(b) - Number(a));
    report += `\n## 四、近 3 年全税种已缴税额 (元)\n\n`;
    report += `| 月份 | ${vatYears.join(' | ')} |\n`;
    report += `| ---- | ${vatYears.map(() => '----').join(' | ')} |\n`;
    for (let i = 0; i < 12; i++) {
      const month = String(i + 1).padStart(2, '0');
      const cols = vatYears.map((year) => {
        const key = `${year}${month}`;
        return tax.vatDeclared?.[year]?.[key] !== undefined ? tax.vatDeclared[year][key] : '--';
      });
      report += `| ${i + 1} 月 | ${cols.join(' | ')} |\n`;
    }

    // 纳税特征
    const tc = tax.taxCharacteristics || {};
    report += `\n## 五、纳税特征\n\n`;
    report += '| 纳税特征维度 | 详情 |\n| ---- | ---- |\n';
    report += `| 纳税信用等级 | ${safeVal(tc.taxRatingCurr)} |\n`;
    report += `| 纳税人类型 | ${safeVal(tc.taxType)} |\n`;
    report += `| 历史有无欠税记录 | ${tc.taxArrearsFlag ? (tc.taxArrearsFlag === '0' ? '否' : '是') : '--'} |\n`;
    report += `| 近 12 个月纳税销售额 | ${safeVal(tc.vatTaxable12m, ' 元')} |\n`;
    report += `| 近 12 个月增值税应纳税额 | ${safeVal(tc.twTaxAmt12Total, ' 元')} |\n`;
    report += `| 近 12 个月纳税总额 | ${safeVal(tc.firstTotalTax, ' 元')} |\n`;
    report += `| 近 24 个月纳税总额 | ${safeVal(tc.totalTax24Month, ' 元')} |\n`;
    report += `| 近两年资产负债率的增长性（%） | ${tc.debtRatioGrowth && tc.debtRatioGrowth !== '--' ? (tc.debtRatioGrowth * 100).toFixed(2) : '--'} |\n`;
    report += `| 近 12 个月 0 申报月份 | ${safeVal(tc.zeroVatMontCountL12m)} |\n`;
    report += `| 近 6 个月 0 申报月份 | ${safeVal(tc.zeroVatMontCountL6m)} |\n`;
    report += `| 滞纳金 | ${safeVal(tc.paidinOvdFeeCnt24m)} |\n`;
    report += `| 税务处罚 | ${safeVal(tc.illegalRecord)} |\n`;
    report += `| 当前欠税 | ${safeVal(tc.owingTaxes)} |\n`;

    // 增值税税负率
    report += `\n## 六、增值税税负率\n\n`;
    report += '| 年份 | 增值税税负率（%） |\n| ---- | ---- |\n';
    const ratioYears = Object.keys(tax.taxBurdenRatio || {}).sort((a: string, b: string) => Number(b) - Number(a));
    for (const year of ratioYears) {
      report += `| ${year} | ${tax.taxBurdenRatio[year] !== undefined ? tax.taxBurdenRatio[year] : '--'} |\n`;
    }

    // 财务情况
    const finYears = Object.keys(tax.financeStats || {}).sort((a: string, b: string) => Number(b) - Number(a));
    report += `\n## 七、财务情况（元）\n\n`;
    report += `| 财务指标 | ${finYears.map((y) => y + ' 年').join(' | ')} |\n`;
    report += `| ---- | ${finYears.map(() => '----').join(' | ')} |\n`;
    const finIndicators = [
      { label: '资产合计', key: 'totalAsset' },
      { label: '负债合计', key: 'totalBalance' },
      { label: '所有者权益合计', key: 'totalInvestorsEquity' },
      { label: '负债和所有权益总计', key: 'balanceAndInvestorsEquity' },
      { label: '营业收入', key: 'operationRevenue' },
      { label: '营业利润', key: 'operatingProfit' },
      { label: '利润总额', key: 'totalProfit' },
      { label: '净利润', key: 'retainedProfit' },
      { label: '现金净增加额', key: 'netCashAdd' },
      { label: '期末现金余额', key: 'currentCashBalance' },
    ];
    for (const { label, key } of finIndicators) {
      const cols = finYears.map((year) =>
        tax.financeStats[year]?.[key] !== undefined ? tax.financeStats[year][key] : '--',
      );
      report += `| ${label} | ${cols.join(' | ')} |\n`;
    }

    // 银税互动
    report += `\n## 八、银税互动\n\n`;
    report += '| 序号 | 申请日期 | 银行名称 | 产品名称 | 贷款余额（元） | 状态 |\n';
    report += '| ---- | ---- | ---- | ---- | ---- | ---- |\n';
    if (tax.silverTaxRecords && Array.isArray(tax.silverTaxRecords)) {
      tax.silverTaxRecords.forEach((record: any, index: number) => {
        report += `| ${index + 1} | ${record.khsqrq || '--'} | ${record.jrjg || '--'} | ${record.jrcp || '--'} | ${record.dkye || '--'} | ${record.slzt || '--'} |\n`;
      });
    }

    // 经营风险
    report += `\n## 九、经营风险\n\n`;
    report += '| 指标 | 是否命中 | 风险等级 | 指标说明 |\n';
    report += '| ---- | ---- | ---- | ---- |\n';
    if (risk && Array.isArray(risk)) {
      for (const item of risk) {
        report += `| ${item.target || '--'} | ${item.hitNot || '--'} | ${item.rskLevel || '--'} | ${item.targetDescription || '--'} |\n`;
      }
    }

    return report.replace(/^\s*\n/gm, '').trim();
  }

  /**
   * 一步到位：原始数据 → Markdown
   * 组合 handleReportDetail + handleReportDetailToMarkdown
   * @param rawData queryReportInterpret 返回的原始数据
   * @returns { markdown: string } 或 { error: string }
   */
  formatReport(rawData: any): { markdown?: string; error?: string } {
    const result = this.handleReportDetail(rawData);
    if (result.error || !result.data) {
      return { error: result.error || '报告详情处理失败' };
    }
    try {
      const markdown = this.handleReportDetailToMarkdown(result.data);
      return { markdown };
    } catch (error: any) {
      this.logger.error(`handleReportDetailToMarkdown error: ${error.message}`);
      return { error: '报告详情处理md失败' };
    }
  }
}
