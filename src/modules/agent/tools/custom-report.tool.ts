/**
 * 自定义报告工具
 * 根据用户上传的模板和数据生成自定义报告
 * 支持三种场景：
 * 1. 文件上传模式：通过 reportId 从缓存获取模板和数据
 * 2. 文本直传模式：用户直接在消息中提供模板和数据文本
 * 3. 仅企业名称：系统自动查询 SaaS 数据
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CacheManager } from 'src/modules/upload/services/cache-manager.service';
import { AgentApiService } from '../api.service';
import { LoggerService } from 'src/modules-global/logger/service';

const PRESET_TEMPLATES = {
  due_diligence: {
    name: '企业尽调分析报告',
    content: `一、企业基本概况
1. 企业工商信息
2. 股权结构与实际控制人
3. 经营范围
4. 资质及许可
二、企业经营状况分析
1. 行业地位与经营模式
2. 上下游交易对手情况
3. 经营稳定性与发展前景
三、发票数据深度分析
1. 开票金额与趋势变化
2. 上下游开票对象集中度
3. 进销项匹配度
4. 经营活跃度与真实性判断
四、税务数据
1. 纳税申报数据
2. 增值税、企业所得税缴纳情况
3. 欠税与稽查记录
五、财务数据及偿债能力分析
1. 资产负债情况
2. 营收、利润及现金流
3. 偿债能力、盈利能力、运营能力
4. 财务真实性与合理性分析
六、司法及合规风险核查
1. 涉诉信息与法律纠纷
2. 失信被执行、限制高消费
3. 行政处罚与经营异常
4. 合规风险综合评估
七、综合风险评估
1. 经营风险
2. 法律合规风险
3. 财税风险
4. 信用风险与偿债风险`,
    keywords: ['进项', '销项', '税', '发票', '收入', '成本', '利润', '纳税', '财务', '资产', '负债', '工商'],
  },
  fund_flow: {
    name: '资金流水尽职调查报告',
    content: `一、报告基本信息
1.1 报告背景与对象
1.2 核查期间
1.3 数据来源
1.4 核查目的
二、账户基本情况
2.1 账户主体信息
2.2 账户绑定信息
2.3 账户使用性质说明
三、总体流水分析
3.1 收支总体规模
3.2 资金余额与波动
3.3 整体流向特征
四、经营性收入分析
4.1 经营收款规模与占比
4.2 经营收款方式特征
4.3 收入稳定性与趋势
4.4 主要交易对手方情况
五、非经营性收入分析
5.1 非经营收入构成
5.2 异常大额收入排查
5.3 收入来源合理性评价
六、支出结构分析
6.1 经营相关支出
6.2 个人及家庭消费支出
6.3 其他类支出
6.4 大额异常支出核查
七、交易行为特征分析
7.1 交易频率与节奏
7.2 交易时段分布
7.3 对手方集中度分析
7.4 账户行为模式评价
八、风险排查
8.1 虚假流水 / 虚增收入排查
8.2 异常交易特征排查
8.3 涉赌涉诈及违规用途排查
8.4 资金用途合规性检查
九、风险提示（如有）
9.1 潜在风险点提示
十、尽调结论
10.1 综合结论`,
    keywords: ['流水', '支付宝', '微信', '银行', '转账', '收款', '付款', '余额', '交易', '账户'],
  },
  general: {
    name: '通用分析模板',
    content: `一、企业概况
二、核心数据分析
三、行业对比分析
四、风险评估
五、综合建议`,
    keywords: [] as string[],
  },
};

function selectPresetTemplate(dataContent: string): { name: string; content: string } {
  let bestMatch = PRESET_TEMPLATES.general;
  let bestScore = 0;

  for (const [key, template] of Object.entries(PRESET_TEMPLATES)) {
    if (key === 'general') continue;
    const score = template.keywords.filter(kw => dataContent.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = template;
    }
  }

  return { name: bestMatch.name, content: bestMatch.content };
}


export function createCustomReportTool({
  cacheManager,
  agentApiService,
  logger,
}: {
  cacheManager: CacheManager;
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'custom_report',
    description: `
根据模板和数据生成自定义报告，支持三种场景：

场景一（文件上传）：
- 系统提示中包含 [自定义报告工具指令] 和 reportId
- 传入 reportId 参数即可

场景二（文本直传）：
- 用户直接在消息中提供了模板内容和数据内容（无需上传文件）
- 此时传入 templateText 和 dataText 参数

场景三（仅企业名称）：
- 当用户只提供了企业名称但没有上传数据文件时，系统会自动查询该企业的 SaaS 数据

附加能力：
- 当用户未上传模板时，系统会根据数据内容自动选择合适的预设模板
- 当用户提供了企业名称时，系统会自动查询该企业的 SaaS 报告数据，并与上传的数据合并
- 根据数据内容填充模板，标题不要修改，没有对应数据的标题下展示"暂无数据"的提示
    `.trim(),
    schema: z.object({
      reportId: z
        .string()
        .optional()
        .describe('报告临时ID (Temp_ID)，文件上传模式时使用'),
      templateText: z
        .string()
        .optional()
        .describe('用户直接提供的模板文本内容，文本直传模式时使用'),
      dataText: z
        .string()
        .optional()
        .describe('用户直接提供的数据文本内容，文本直传模式时使用'),
      companyName: z
        .string()
        .optional()
        .describe('企业名称'),
    }),
    func: async ({ reportId, templateText, dataText, companyName }) => {
      let template = '';
      let dataContents: string[] = [];
      let companyNameVal = companyName;
      let taxNoVal = '';
      let dataSource = '';

      // === 模式一：文件上传模式 ===
      if (reportId) {
        const data = cacheManager.get(reportId);
        if (!data) return '报告数据已过期或不存在，请重新上传文件';

        template = data.templateContent;
        dataContents = data.dataContents.map(item => typeof item === 'string' ? item : item.content);
        companyNameVal = data.companyName;
        taxNoVal = data.taxNo || '';
        cacheManager.markUsed(reportId);
      }
      // === 模式二：文本直传模式 ===
      else if (templateText || dataText) {
        template = templateText || '';
        if (dataText) dataContents = [dataText];

        // 文本直传模式下，如果提供了企业名称，通过搜索获取税号
        if (companyNameVal && !taxNoVal) {
          try {
            const searchResult = await agentApiService.searchCompany(companyNameVal, 1);
            const companies = searchResult.data?.data;
            if (Array.isArray(companies) && companies.length > 0) {
              taxNoVal = companies[0].credit_no;
            }
          } catch (e: any) {
            logger.error(`企业搜索失败: ${e.message}`);
          }
        }
      }
      else {
        return '请提供报告所需的信息：上传模板和数据文件，或直接在消息中提供模板和数据内容';
      }

      // === 企业报告解读数据查询 ===
      if (taxNoVal) {
        const reportResponse = await agentApiService.queryReportInterpret(taxNoVal).catch((e: any) => {
          logger.error(`queryReportInterpret 失败: ${e.message}`);
          return null;
        });
        if (reportResponse?.data) {
          const interpretData = reportResponse.data;
          const referenceData = `### 以下为企业报告解读参考数据\n${JSON.stringify(interpretData, null, 2)}`;
          logger.log(`referenceData: ${referenceData}`);
          dataContents.push(referenceData);
          dataSource = dataContents.length > 1 ? '上传数据 + 报告解读数据' : '报告解读数据';
        }
      }

      if (!dataSource) {
        dataSource = '上传数据';
      }

      // === 预设模板选择 ===
      if (!template && dataContents.length > 0) {
        const allData = dataContents.join('\n');
        const selected = selectPresetTemplate(allData);
        template = selected.content;
      }

      // === 参数不足检查 ===
      if (!template && dataContents.length === 0) {
        return '请提供报告所需的信息：上传模板和数据文件，或直接在消息中提供模板和数据内容';
      }
      if (template && dataContents.length === 0) {
        return '请提供数据内容，以便根据模板生成报告';
      }

      // === 组装结果 ===
      let result = '## 模板内容\n';
      result += template + '\n\n';
      result += '## 数据内容\n';
      result += `（数据来源：${dataSource}）\n\n`;
      dataContents.forEach(content => {
        result += content + '\n\n';
      });

      return result.trim();
    },
  });
}
