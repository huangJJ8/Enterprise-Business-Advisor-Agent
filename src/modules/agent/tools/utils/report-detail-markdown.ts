/**
 * 报告详情 Markdown 处理工具
 */

export function handleReportDetailToMarkdown(data: any[]): string {
  // 解构原始数据
  const [basicInfoData, salesPurchaseData, taxFinanceData, businessRiskData] = data;
  const basic = basicInfoData.basicInfo || {};
  const sales = salesPurchaseData;
  const tax = taxFinanceData;
  const risk = businessRiskData;

  // ===================== 1. 基础信息 =====================
  let report = `# 企业报告详情
  
## 一、基本信息
- 企业名称：${basic.taxName || '--'}
- 成立时间：${basic.registerDate || '--'}
- 注册地址：${basic.registerAddress || '--'}
- 统一社会信用代码：${basic.taxNo || '--'}
- 企业类型：${basic.registeredType || '--'}
- 法定代表人：${basic.legalPerson || '--'}
- 注册资本：${basic.registerCapital ? basic.registerCapital + ' 元' : '--'}
- 企业状态：${basic.status || '--'}
- 所属行业：${basic.industry || '--'}
- 纳税人等级：${basic.creditLevel || '--'}
- 纳税人类型：${basic.taxType || '--'}
  
## 二、下游销售
  
### （一）开票对比分析

**总结：** <span style="color:red;">{{总结}}</span>
  
| 开票对比维度 | 近 3 个月 | 近 6 个月 | 近 9 个月 | 近 12 个月 | 近 1 个月 |
| ---- | ---- | ---- | ---- | ---- | ---- |
${[
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
  ]
    .map(({ label, key }) => {
      const val0 = sales.downStreamSales?.[0]?.[key] ?? '--';
      const val1 = sales.downStreamSales?.[1]?.[key] ?? '--';
      const val2 = sales.downStreamSales?.[2]?.[key] ?? '--';
      const val3 = sales.downStreamSales?.[3]?.[key] ?? '--';
      const val4 = sales.downStreamSales?.[4]?.[key] ?? '--';
      return `| ${label} | ${val0} | ${val1} | ${val2} | ${val3} | ${val4} |`;
    })
    .join('\n')}
  
### （二）开票金额(万元)

**总结：** <span style="color:red;">{{总结}}</span>
  
| 月份 | 2025 | 2024 | 2023 | 2022 |
| ---- | ---- | ---- | ---- | ---- |
${Array.from({ length: 12 }, (_, i) => ({
    month: `${i + 1} 月`,
    index: i,
  }))
    .map(({ month, index }) => {
      const amount0 = sales.salesInfo?.[0]?.value?.[index]?.amount ?? '--';
      const amount1 = sales.salesInfo?.[1]?.value?.[index]?.amount ?? '--';
      const amount2 = sales.salesInfo?.[2]?.value?.[index]?.amount ?? '--';
      const amount3 = sales.salesInfo?.[3]?.value?.[index]?.amount ?? '--';
      return `| ${month} | ${amount0} | ${amount1} | ${amount2} | ${amount3} |`;
    })
    .join('\n')}
  
### （三）近 12 月前十大客户

**总结：** <span style="color:red;">{{总结}}</span>
  
| 序号 | 客户名称 | 销售金额（元） | 销售占比（%） | 是否存在关联关系 | 成立时间 | 社保参保人数 | 经营状态 | 登记注册类型 | 所在行业 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |`;

  // 拼接前十大客户行
  if (sales.downTopCorp && Array.isArray(sales.downTopCorp)) {
    sales.downTopCorp.forEach((customer: any) => {
      report += `
| ${customer.rank || '--'} | ${customer.customer || '--'} | ${customer.amountTax || '--'} | ${customer.amountTaxRate || '--'} | ${customer.isTrade || '--'} | ${customer.startDate || '--'} | ${customer.participantsNumber || '--'} | ${customer.status || '--'} | ${customer.registeType || '--'} | ${customer.industryName || '--'} |`;
    });
  }

  // ===================== 2. 上游采购 =====================
  report += `
  
## 三、上游采购
  
### （一）开票对比分析

**总结：** <span style="color:red;">{{总结}}</span>
  
| 开票对比维度 | 近 3 个月 | 近 6 个月 | 近 9 个月 | 近 12 个月 | 近 1 个月 |
| ---- | ---- | ---- | ---- | ---- | ---- |
${[
    { label: '开票金额（元）', key: 'validAmountTax' },
    { label: '同比（%）', key: 'amountTaxTb' },
    { label: '环比（%）', key: 'amountTaxHb' },
    { label: '发票张数', key: 'validCount' },
    { label: '废票数量', key: 'invalidCount' },
    { label: '红冲数量', key: 'negativeCount' },
    { label: '上游供应商数量', key: 'upStreamCorps' },
    { label: '废票金额占比（%）', key: 'invalidAmountRate' },
    { label: '红冲金额占比（%）', key: 'negativeAmountRate' },
  ]
    .map(({ label, key }) => {
      const val0 = sales.upStreamPurchases?.[0]?.[key] ?? '--';
      const val1 = sales.upStreamPurchases?.[1]?.[key] ?? '--';
      const val2 = sales.upStreamPurchases?.[2]?.[key] ?? '--';
      const val3 = sales.upStreamPurchases?.[3]?.[key] ?? '--';
      const val4 = sales.upStreamPurchases?.[4]?.[key] ?? '--';
      return `| ${label} | ${val0} | ${val1} | ${val2} | ${val3} | ${val4} |`;
    })
    .join('\n')}
  
### （二）采购金额(万元)

**总结：** <span style="color:red;">{{总结}}</span>
  
| 月份 | 2025 | 2024 | 2023 | 2022 |
| ---- | ---- | ---- | ---- | ---- |
${Array.from({ length: 12 }, (_, i) => ({
    month: `${i + 1} 月`,
    index: i,
  }))
    .map(({ month, index }) => {
      const amount0 = sales.purchaseInfo?.[0]?.value?.[index]?.amount ?? '--';
      const amount1 = sales.purchaseInfo?.[1]?.value?.[index]?.amount ?? '--';
      const amount2 = sales.purchaseInfo?.[2]?.value?.[index]?.amount ?? '--';
      const amount3 = sales.purchaseInfo?.[3]?.value?.[index]?.amount ?? '--';
      return `| ${month} | ${amount0} | ${amount1} | ${amount2} | ${amount3} |`;
    })
    .join('\n')}
  
### （三）近 12 月前十大供应商

**总结：** <span style="color:red;">{{总结}}</span>
  
| 序号 | 供应商名称 | 采购金额（元） | 采购占比（%） | 是否存在关联关系 | 成立时间 | 社保参保人数 | 经营状态 | 登记注册类型 | 所在行业 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |`;

  // 拼接前十大供应商行
  if (sales.upTopCorp && Array.isArray(sales.upTopCorp)) {
    sales.upTopCorp.forEach((supplier: any) => {
      report += `
| ${supplier.rank || '--'} | ${supplier.customer || '--'} | ${supplier.amountTax || '--'} | ${supplier.amountTaxRate || '--'} | ${supplier.isTrade || '--'} | ${supplier.startDate || '--'} | ${supplier.participantsNumber || '--'} | ${supplier.status || '--'} | ${supplier.registeType || '--'} | ${supplier.industryName || '--'} |`;
    });
  }

  // ===================== 3. 纳税相关 =====================
  report += `
  
## 四、近 3 年全税种已缴税额 (元)

**总结：** <span style="color:red;">{{总结}}</span>
  
| 月份 | 2025 | 2024 | 2023 |
| ---- | ---- | ---- | ---- |
${Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0');
    return {
      label: `${i + 1} 月`,
      key2025: `2025${month}`,
      key2024: `2024${month}`,
      key2023: `2023${month}`,
    };
  })
    .map(
      ({ label, key2025, key2024, key2023 }) =>
        `| ${label} | ${tax.vatDeclared?.['2025']?.[key2025] || '--'} | ${tax.vatDeclared?.['2024']?.[key2024] || '--'} | ${tax.vatDeclared?.['2023']?.[key2023] || '--'} |`
    )
    .join('\n')}
  
## 五、纳税特征

**总结：** <span style="color:red;">{{总结}}</span>
  
| 纳税特征维度 | 详情 |
| ---- | ---- |
| 纳税信用等级 | ${tax.taxCharacteristics?.taxRatingCurr || '--'} |
| 纳税人类型 | ${tax.taxCharacteristics?.taxType || '--'} |
| 历史有无欠税记录 | ${tax.taxCharacteristics?.taxArrearsFlag ? (tax.taxCharacteristics.taxArrearsFlag === '0' ? '否' : '是') : '--'} |
| 近 12 个月纳税销售额 | ${tax.taxCharacteristics?.vatTaxable12m ? tax.taxCharacteristics.vatTaxable12m + ' 元' : '--'}|
| 近 12 个月增值税应纳税额 | ${tax.taxCharacteristics?.twTaxAmt12Total ? tax.taxCharacteristics.twTaxAmt12Total + ' 元' : '--'}|
| 近 12 个月纳税总额 | ${tax.taxCharacteristics?.firstTotalTax ? tax.taxCharacteristics.firstTotalTax + ' 元' : '--'}|
| 近 24 个月纳税总额 | ${tax.taxCharacteristics?.totalTax24Month ? tax.taxCharacteristics.totalTax24Month + ' 元' : '--'}|
| 近两年资产负债率的增长性（%） | ${tax.taxCharacteristics?.debtRatioGrowth && tax.taxCharacteristics.debtRatioGrowth !== '--' ? (tax.taxCharacteristics.debtRatioGrowth * 100).toFixed(2) : '--'} |
| 近 12 个月 0 申报月份 | ${tax.taxCharacteristics?.zeroVatMontCountL12m || '--'}|
| 近 6 个月 0 申报月份 | ${tax.taxCharacteristics?.zeroVatMontCountL6m || '--'}|
| 滞纳金 | ${tax.taxCharacteristics?.paidinOvdFeeCnt24m || '--'}|
| 税务处罚 | ${tax.taxCharacteristics?.illegalRecord || '--'}|
| 当前欠税 | ${tax.taxCharacteristics?.owingTaxes || '--'}|
  
## 六、增值税税负率

增值税税负率=总纳税额/总应税销售总额*100%，若企业增值税税负率环比下降幅度过高时，可能存在采购虚假发票抵扣税款，或延迟开具发票的风险。\n<br>
  
**总结：** <span style="color:red;">{{总结}}</span>
  
| 年份 | 增值税税负率（%） |
| ---- | ---- |
| 2024 | ${tax.taxBurdenRatio?.['2024'] ?? '--'} |
| 2023 | ${tax.taxBurdenRatio?.['2023'] ?? '--'} |
  
## 七、财务情况（元）

**总结：** <span style="color:red;">{{总结}}</span>
  
| 财务指标 | 2024 年 | 2023 年 | 2022 年 |
| ---- | ---- | ---- | ---- |
${[
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
  ]
    .map(({ label, key }) => {
      const val2024 = tax.financeStats?.['2024']?.[key] ?? '--';
      const val2023 = tax.financeStats?.['2023']?.[key] ?? '--';
      const val2022 = tax.financeStats?.['2022']?.[key] ?? '--';
      return `| ${label} | ${val2024} | ${val2023} | ${val2022} |`;
    })
    .join('\n')}
  
## 八、银税互动

**总结：** <span style="color:red;">{{总结}}</span>
  
| 序号 | 申请日期 | 银行名称 | 产品名称 | 贷款余额（元） | 状态 |
| ---- | ---- | ---- | ---- | ---- | ---- |`;

  // 拼接银税互动记录行
  if (tax.silverTaxRecords && Array.isArray(tax.silverTaxRecords)) {
    tax.silverTaxRecords.forEach((record: any, index: number) => {
      report += `
| ${index + 1} | ${record.khsqrq || '--'} | ${record.jrjg || '--'} | ${record.jrcp || '--'} | ${record.dkye || '--'} | ${record.slzt || '--'} |`;
    });
  }

  report += `
## 九、经营风险

**总结：** <span style="color:red;">{{总结}}</span>
  
| 指标 | 是否命中 | 风险等级 | 指标说明 |
| ---- | ---- | ---- | ---- |`;

  // 拼接经营风险行
  if (risk && Array.isArray(risk)) {
    risk.forEach((item: any) => {
      report += `
| ${item.target || '--'} | ${item.hitNot || '--'} | ${item.rskLevel || '--'} | ${item.targetDescription || '--'} |`;
    });
  }

  // 清理多余空白行，返回最终结果
  return report.replace(/^\s*\n/gm, '').trim();
}
