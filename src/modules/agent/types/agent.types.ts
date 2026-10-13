/**
 * Agent 相关类型定义
 */

export interface UserContext {
  orgNo: string;
  orgChannelNo: string;
  orgChannelUserId: number;
  session?: string;
}

export interface UserInfo {
  province?: string;       // 省份（中文）
  city?: string;           // 城市（中文）
  district?: string;       // 区县（中文）
  provinceCode?: string;   // 省份编码
  cityCode?: string;       // 城市编码
  countyCode?: string;     // 区县编码
  orgNo: string;
  orgChannelNo: string;
  id: number;
  name?: string;           // 用户名称
}

export interface EnterpriseRelationshipRequest {
  taxNo: string;                    // 企业税号
  orgNo: string;                    // 机构编号
  direction: 'upstream' | 'downstream' | 'both';  // 查询方向
  customMode: boolean;              // true=使用机构配置核企, false=使用自定义核企
  needEnterpriseList: boolean;      // 是否返回核心企业名单
  provinceCode?: string;            // 省份编码
  cityCode?: string;                // 城市编码
  countyCode?: string;              // 区县编码
  customEnterpriseNames?: string[]; // 自定义核心企业名称列表（customMode=false 时使用）
}

export interface EnterpriseRelationshipResponse {
  success: boolean;
  returnCode: string;               // 业务状态码，如 "200"、"40404"
  returnMessage: string;
  data: {
    enterpriseName: string;
    enterpriseId: string;
    direction: string,
    isMatch: boolean;               // 是否匹配到核心企业上下游
    hasCoreConfig: boolean;         // 机构是否已配置核心企业
    message?: string;               // 附加消息
    matchedEnterprises?: MatchedEnterprise[];  // 匹配的核心企业列表
    total?: number;                 // 匹配总数
  };
}

export interface MatchedEnterprise {
  enterpriseId: string;              // 核心企业ID
  enterpriseName: string;            // 核心企业名称
  relationshipType: 'upstream' | 'downstream';  // 上游或下游
  transactionAmount: number;         // 交易金额
  transactionCount: number;          // 交易笔数
  industry: string;                  // 行业
  willingness: number;               // 意愿度
}

// ========== Top20 上下游企业查询 ==========

export interface Top20Request {
  taxNo: string;                    // 核心企业税号
  orgNo: string;                    // 机构编号
  direction: 'upstream' | 'downstream' | 'both';  // 查询方向
  limit?: number;                   // 返回数量，默认10
  provinceCode?: string;            // 省份编码
  cityCode?: string;                // 城市编码
  countyCode?: string;              // 区县编码
}

export interface Top20Partner {
  enterpriseId: string;
  enterpriseName: string;
  relationshipType: 'upstream' | 'downstream';
  recommendationStars: number;       // 推荐星级 1-5
  hopLevel: number;                  // 跳数层级
  willingness: number;               // 营销意愿度 0-1
  industry: string;                  // 行业
  transactionAmount: number | null;  // 交易金额
  transactionCount: number | null;   // 交易笔数
}

export interface Top20Response {
  success: boolean;
  returnCode: string;
  returnMessage: string;
  data: {
    enterpriseId: string;
    direction: string;
    partners: Top20Partner[];
  };
}

// ========== 两企业直接交易关系查询 ==========

export interface DirectRelationshipRequest {
  enterpriseA: string;              // 企业A税号
  enterpriseB: string;              // 企业B税号
}

export interface DirectRelationshipResponse {
  success: boolean;
  returnCode: string;
  returnMessage: string;
  data: {
    enterpriseA: string;
    enterpriseB: string;
    isUpstream: boolean;            // A是否是B的上游
    isDownstream: boolean;          // A是否是B的下游
    hasTransaction: boolean;        // 是否有交易关系
    description: string;            // 关系描述
  };
}

// ========== 组合标签查询企业列表 ==========

export interface QueryByTagsRequest {
  tags: Record<string, string>;
  provinceCode?: string;
  cityCode?: string;
  countyCode?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface QueryByTagsEnterprise {
  enterpriseId: string;
  enterpriseName: string;
  tags?: Record<string, any>;
}

export interface QueryByTagsResponse {
  success: boolean;
  returnCode: string;
  returnMessage: string;
  data: {
    enterprises: QueryByTagsEnterprise[];
    total: number;
    pageNum: number;
    pageSize: number;
    totalPages: number;
  };
  total?: number;
}

export interface AgentConfig {
  // LLM 配置
  modelName: string;
  apiKey: string;
  baseURL: string;
  temperature: number;
  maxTokens: number;

  // 知识库配置
  kbEnabled: boolean;
  kbTopK: number;

  // 会话配置
  sessionMaxAge: number;

  // 服务配置
  serviceUrl: string;
}

export interface StreamChunk {
  type: 'token' | 'tool' | 'error' | 'done' | 'toolDone';
  content?: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
}

export interface ToolCallInfo {
  name: string;
  input: any;
  output: string;
  timestamp: number;
}

export interface AgentResponse {
  answer: string;
  toolCalls: ToolCallInfo[];
  sessionId: string;
}
