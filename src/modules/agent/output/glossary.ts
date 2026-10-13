/**
 * 输出净化术语词典
 *
 * 用途：把模型回答里可能泄漏的「技术标识符」映射为用户可理解的中文业务术语。
 * 依据：prompts/system-prompt.ts 中的
 *   - <rule name="禁止暴露数据来源与字段名" priority="P0">
 *   - <rule name="HTML标签处理规则" priority="P1">
 *
 * 维护约定：
 * 1. 词表来源是 src/modules/agent/ 下各工具与 api.service 里的**真实标识符**，
 *    不要凭印象编造键名，否则既替换不到、又可能误伤正常文本。
 * 2. 键名大小写敏感，必须与代码中的写法完全一致。
 * 3. 三个词表之间不要出现重复键；工具名词表优先级最高（后写入会覆盖）。
 */

/**
 * 工具函数名 → 业务术语
 * 与 src/modules/agent/tools/index.ts 中 createAgentTools() 注册的工具一一对应。
 */
export const TOOL_NAME_GLOSSARY: Record<string, string> = {
  query_orders: '订单查询',
  report_interp: '报告解读',
  report_detail: '报告详情',
  check_collection_progress: '采集进度查询',
  generate_collection_link: '采集链接生成',
  get_marketing_opportunities: '营销商机查询',
  follow_wechat: '公众号关注',
  query_credit_product_list: '信贷产品列表',
  check_admission: '准入查询',
  search_enterprise_by_tag: '企业标签搜索',
  check_corp_status: '经营状态查询',
  query_admission_list: '准入企业列表',
  query_business_info: '工商信息查询',
  query_marketable_list: '可营销名单',
  check_core_enterprise: '核心企业查询',
  risk_list: '风险列表',
  risk_detail: '风险详情',
  risk_category: '风险类别说明',
  enterprise_relationship: '上下游关系查询',
  query_top20: '上下游名单查询',
  query_direct_relationship: '企业间交易关系查询',
  query_by_tags: '组合标签查询',
  get_report_answer_user: '财税数据问答',
  query_enterprise_tags: '营销标签查询',
  annual_report: '年报查询',
  custom_report: '自定义报告',
  match_products: '产品匹配',
};

/**
 * 字段名 → 业务字段的中文说法
 * 覆盖代码中真实出现过的 camelCase / snake_case 数据字段。
 */
export const FIELD_NAME_GLOSSARY: Record<string, string> = {
  // 企业主体
  enterpriseName: '企业名称',
  corpName: '企业名称',
  companyName: '企业名称',
  matchedName: '匹配到的企业名称',
  corp_name: '企业名称',
  traderName: '交易对手名称',
  subjectName: '主体名称',
  enterpriseId: '企业标识',
  matchedEnterprises: '匹配到的企业',
  customEnterpriseNames: '自定义企业名单',
  enterpriseA: '企业A',
  enterpriseB: '企业B',

  // 证照与编号
  taxNo: '纳税人识别号',
  corpTaxNo: '纳税人识别号',
  creditNo: '纳税人识别号',
  credit_no: '纳税人识别号',
  orgNo: '机构编号',
  orgChannelNo: '渠道编号',
  orgChannelUserId: '渠道用户标识',
  institutionChannelBff: '机构渠道',
  modelNo: '型号',
  stockCode: '股票代码',
  stock_code: '股票代码',
  registCapi: '注册资本',

  // 查询与分页
  pageNum: '页码',
  pageSize: '每页条数',
  searchStatus: '查询状态',
  queryType: '查询类型',
  query_type: '查询类型',
  reportType: '报告类型',
  reportName: '报告名称',
  reportId: '报告编号',
  reportPeriod: '报告期',
  report_period: '报告期',
  reportFile: '报告文件',
  reportResponse: '报告响应',

  // 财税指标
  taxCharacteristics: '纳税特征',
  taxCreditRating: '纳税信用等级',
  invoiceAmount: '开票金额',
  amountTaxRate: '价税合计比率',
  transactionCount: '交易笔数',
  transactionAmount: '交易金额',
  downStreamSales: '下游销售额',
  upStreamPurchases: '上游采购额',
  downTopCorp: '下游头部企业',

  // 风险与评估
  rskLevel: '风险等级',
  riskLevel: '风险等级',
  verifyResult: '核验结果',
  verifyEnterprise: '企业核验',
  relationshipType: '关联关系类型',
  directionLabel: '上下游方向',
  needEnterpriseList: '是否需要企业名单',
  viewStatus: '查看状态',
  targetDescription: '标的描述',

  // 标签体系（query_by_tags / search_enterprise_by_tag 的标签键）
  is_online: '是否在营',
  is_listed: '是否上市',
  is_high_tech: '是否高新技术企业',
  is_top_500: '是否500强企业',
  is_gazelle: '是否瞪羚企业',
  is_unicorn: '是否独角兽企业',
  is_tech_small: '是否科技型中小企业',
  is_yangqi: '是否央企',
  is_guoqi: '是否国企',
  is_spec: '是否专精特新',
  is_innovate: '是否创新型企业',
  is_hospital: '是否医院',
  is_high_school: '是否高校',
  is_tax_a: '是否纳税信用A级',
  is_core_upstream: '是否核心上游',
  is_core_downstream: '是否核心下游',
  fake_state_owned: '假国企风险',
  supplier_stability: '供应商稳定性',
  business_activity: '经营活跃度',
  business_stability: '经营稳定性',
  credit_lever: '信贷杠杆',
  enterprise_scale: '企业规模',
  marketing_willingness: '营销意愿',

  // 财务与经营分析
  key_indicators: '关键指标',
  per_share: '每股指标',
  profit_quality: '盈利质量',
  return_on_investment: '投资回报',
  operating_capacity: '经营能力',
  asset_structure: '资产结构',
  financial_risk: '财务风险',
  balance_sheet: '资产负债表',
  income_statement: '利润表',

  // 风险扫描维度
  illegal_business: '违法经营',
  tax_illegal: '税务违法',
  industry_deviation: '行业偏离',
  circle_blacklist: '关联方黑名单',
  related_party_transaction: '关联交易',
  closed_loop_trade: '闭环交易',
  high_goods_similarity: '高相似度商品',
  finance_count: '融资次数',
  fund_flow: '资金流向',
  due_diligence: '尽职调查',
  trade_mode: '贸易模式',

  // 地区与行业
  provinceName: '省份',
  cityName: '城市',
  countyName: '区县',
  province_name: '省份',
  provinceCode: '省份编码',
  cityCode: '城市编码',
  countyCode: '区县编码',
  areaName: '所属地区',
  industryName: '所属行业',
  industry_name: '所属行业',
  industryCode: '行业编码',
  industry_code: '行业编码',

  // 时间
  createdTime: '创建时间',
  updatedTime: '更新时间',
  startTime: '开始时间',
  startDate: '成立日期',
  create_time: '创建时间',

  // 授权与鉴权
  hasAuth: '是否已授权',
  authPassed: '是否通过授权',
  authResult: '授权结果',
  authData: '授权数据',
  authFileId: '授权文件标识',
  authFileName: '授权文件名',

  // 文件与任务
  fileName: '文件名',
  fileIds: '文件标识',
  uploadId: '上传标识',
  taskId: '任务编号',
  historyId: '历史记录编号',
  textContent: '文本内容',
  sessionId: '会话标识',

  // 渠道与返回体
  returnCode: '返回码',
  returnMessage: '返回信息',
  errorMessage: '错误信息',
  errMsg: '错误信息',
  failReason: '失败原因',
  respData: '响应数据',
  saasData: '业务数据',
  rpaData: '采集数据',
  rawData: '原始数据',
  searchResult: '查询结果',
  detailResult: '详细结果',
  mergeResult: '归并结果',
  isMatch: '是否匹配',
  hitNot: '未命中',
  safeVal: '安全值',
  fieldName: '字段名',

  // 对话
  userQuery: '用户问题',
  originalQuestion: '原始问题',
};

/**
 * 框架 / 协议层面的内部标识符
 * 这些词一旦出现在用户可见文本里，说明模型把内部实现说漏了。
 */
export const INTERNAL_TERM_GLOSSARY: Record<string, string> = {
  tool_calls: '工具调用记录',
  tool_call: '工具调用',
  tool_call_id: '工具调用标识',
  tool_output: '工具返回内容',
  tools_output_rules: '工具输出规则',
  output_rules: '输出规则',
  langgraph_node: '执行节点',
};

/**
 * 需要「成对出现」的自定义标签
 * 依据 system-prompt.ts 中 <rule name="自定义标签必须闭合" priority="P0"> 的明确枚举。
 *
 * 注意：qrcode / br 等标签**故意不在此列表**——
 * 提示词中 <qrcode url="..."/> 本身就是自闭合写法，擅自改成配对形式反而会破坏渲染。
 * 工具返回的 report-card / generatereport 等协议标签同样不在列表内，
 * 以保证「工具返回内容 100% 原样输出」。
 */
export const PAIRED_TAGS: ReadonlySet<string> = new Set([
  'go',
  'g1',
  'g3',
  'top20',
  'line',
  'pages',
  'core-enterprise-upload',
  'custom-report',
]);
