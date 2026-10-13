/**
 * Agent API Service
 * 集中管理所有 Agent 工具使用的 API 接口
 */
import { Injectable } from '@nestjs/common';
import { HttpService } from 'src/modules-global/http/service';
import { LoggerService } from 'src/modules-global/logger/service';
import {
  UserContext,
  EnterpriseRelationshipRequest,
  EnterpriseRelationshipResponse,
  DirectRelationshipRequest,
  DirectRelationshipResponse,
  QueryByTagsRequest,
  QueryByTagsResponse,
  Top20Request,
  Top20Response,
} from './types/agent.types';
import { AgentConfig } from './config/agent.config';
import { buildUserId } from './utils/build-user-id';
import { isDev } from 'src/config';
import * as fs from 'fs';
import * as path from 'path';
import { TAG_FIELD_MAP } from './tools/utils/industry-tag-map';

@Injectable()
export class AgentApiService {
  private userContext!: UserContext;
  private serviceUrl!: string;
  private dataServiceUrl!: string;
  private relationshipServiceUrl!: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly agentConfig: AgentConfig,
    private readonly logger: LoggerService,
  ) {
    this.dataServiceUrl = this.agentConfig.dataServiceUrl;
  }

  /**
   * 初始化 API Service（设置用户上下文和服务地址）
   */
  init(
    userContext: UserContext,
    serviceUrl: string,
    dataServiceUrl?: string,
    relationshipServiceUrl?: string,
  ) {
    this.userContext = userContext;
    this.serviceUrl = serviceUrl;
    this.dataServiceUrl = dataServiceUrl || '';
    this.relationshipServiceUrl = relationshipServiceUrl || '';
  }

  /**
   * 验证用户是否有权限访问该企业
   * @param taxNo 企业税号
   */
  async checkUserHasTaxNo(taxNo: string) {
      // 测试用：Acme白名单机构号 + 指定税号直接返回通过
      const acmeTestWhitelist = ['ACME-ORG-ID-0000001', 'ORG0000000000000000A'];
      if (taxNo === '915YDFKWQM174M4NEH' && acmeTestWhitelist.includes(this.userContext.orgNo)) {
        return { data: { success: true, message: '示例企业M有限公司 - 测试直接通过' } };
      }

      return this.httpService.post({
        url: `${this.serviceUrl}/institutionChannelBff/ai/checkUserHasTaxNo/v1`,
        data: {
          taxNo,
        },
        headers: {
          cookie: this.userContext.session,
        } as any,
      });
    }

  /**
   * 查询订单列表
   * @param params 查询参数
   */
  async listTaxNoInfo(params: {
    corpName?: string;
    pageNum: number;
    pageSize: number;
  }) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/listTaxNoInfoH5/v1`,
      data: {
        orgNo: this.userContext.orgNo,
        orgChannelNo: this.userContext.orgChannelNo,
        orgChannelUserId: this.userContext.orgChannelUserId,
        corpName: params.corpName || '',
        pageNum: params.pageNum,
        pageSize: params.pageSize,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取 RPA 采集链接
   */
  async getRpaLinkUrl() {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/ai/getRpaLinkUrl/v1`,
      data: {
        orgNo: this.userContext.orgNo,
        orgChannelNo: this.userContext.orgChannelNo,
        orgChannelUserId: this.userContext.orgChannelUserId,
        linkType: '4',
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 查询企业 SaaS 报告
   * @param taxNo 企业税号
   * http://data.middle.example.com/egress/saasReport/saasAdvancedReport/v2
   */
  async querySaasReport(taxNo: string) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/querySaasReport/v1`,
      data: {
        taxNo,
        orgNo: this.userContext.orgNo,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 查询 saas 报表数据的通用方法
   * @param taxNo 企业税号
   * @param reportPath 报表接口路径（如 saasSalesReport / saasPurchaseReport）
   * @param label 日志标签（如 "经营收入" / "采购支出"）
   */
  async querySaasReportData(
    taxNo: string,
    reportPath: string,
    label: string,
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    let effectiveTaxNo = taxNo;
    if (isDev) {
      effectiveTaxNo = '91EFNLKPN7F18B2ETA';
    }

    const url = `${this.agentConfig.saasCheckUrl}/saas/report/${reportPath}?taxNo=${encodeURIComponent(effectiveTaxNo)}&userId=11`;
    this.logger.log(`查询${label}: taxNo=${effectiveTaxNo}`);

    const response = await this.httpService.post({ url });
    const respData = response.data as any;

    if (!respData?.success) {
      return {
        success: false,
        message: respData?.returnMessage || `查询${label}失败`,
      };
    }

    return { success: true, data: respData.data };
  }

  /**
   * 查询经营收入数据
   * @param taxNo 企业税号
   */
  async querySalesReport(taxNo: string) {
    return this.querySaasReportData(taxNo, 'saasSalesReport', '经营收入');
  }

  /**
   * 查询采购支出数据
   * @param taxNo 企业税号
   */
  async queryPurchaseReport(taxNo: string) {
    return this.querySaasReportData(taxNo, 'saasPurchaseReport', '采购支出');
  }

  /**
   * 查询 AI 报告
   * @param taxNo 企业税号
   * 获取简易报告的UI链接
   */
  async queryAiReport(taxNo: string) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/aireport/v1`,
      data: {
        taxNo,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 查询报告详情（通过 BFF）简易报告
   * @param taxNo 企业税号
   */
  async queryReportInterpret(taxNo: string) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/reportInterpret/v1`,
      data: {
        taxNo,
        orgNo: this.userContext.orgNo,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 企业模糊搜索
   * @param searchkey 企业名称关键词
   * @param count 返回数量
   */
  async searchCompany(searchkey: string, count: number = 5) {
    return this.httpService.post({
      url: `${this.dataServiceUrl}/biz/corp/companyFuzzySearch`,
      data: {
        companyShortName: searchkey,
        count,
        fieldOrderSpecs: [
          {
            fieldName: 'regist_capi',
            order: '-1',
          },
          {
            fieldName: 'start_date',
            order: 0,
          },
        ],
      },
    });
  }

  /**
   * 获取简易报告链接
   * @param taxNo 企业税号
   */
  async getSimpleReportLink(taxNo: string) {
    return this.httpService.post({
      url: `https://fintech.example.com/warroomRpaBff/warroomApi/report/simpleReport`,
      data: {
        taxNo,
        updateTime: new Date().toLocaleString('zh-CN'),
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取推荐产品列表
   * @param params 查询参数
   */
  async getRecommendProductList(params: { taxNo: string }) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/ai/getRecommendProductList/v1`,
      data: {
        taxNo: params.taxNo,
        orgNo: this.userContext.orgNo,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取营销商机列表
   * @param params 查询参数
   */
  async getMarketingOpportunityList(params: {
    corpName?: string;
    pageNum: number;
    pageSize: number;
  }) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/marketingOpportunityList/v1`,
      data: {
        orgNo: this.userContext.orgNo,
        orgChannelNo: this.userContext.orgChannelNo,
        orgChannelUserId: this.userContext.orgChannelUserId,
        corpName: params.corpName || '',
        pageNum: params.pageNum,
        pageSize: params.pageSize,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取机构产品列表
   */
  async getProductList() {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/getProductList/v1`,
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 准入查询 — 检查企业是否符合某产品的准入策略
   * @param params searchType: "1"=按产品查准入, "2"=查核企
   */
  async getSearchResult(params: {
    taxNo: string;
    searchType: string;
    modelNo?: string;
  }) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/getSearchResult/v1`,
      data: {
        taxNo: params.taxNo,
        searchType: params.searchType,
        modelNo: params.modelNo || '',
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 查询企业经营状态（是否在营、核企上游/下游）
   * @param corpName 企业名称
   * @param checkName 检查类型：is_online / is_core_upstream / is_core_downstream
   */
  async checkCorpStatus(corpName: string, checkName: string) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/ai/checkCorpStatus/v1`,
      data: { corpName, checkName },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 按标签搜索企业
   * @param areaCode 地区编码
   * @param tag 企业标签
   */
  async tagSearchCompany(areaCode: string, tag: string) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/tagSearchCompany/v1`,
      data: { areaCode, tag },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 查询符合/不符合准入的企业列表
   * @param searchStatus 1=符合准入, 2=不符合准入
   */
  async getCorpListBySearchStatus(searchStatus: number) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/ai/getCorpListBySearchStatus/v1`,
      data: { searchStatus },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取企业工商信息
   * @param taxNo 企业税号
   */
  async getBasicInformation(taxNo: string) {
    if (isDev) {
      const mockData = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), 'src/mock/工商数据接口.json'),
          'utf-8',
        ),
      );
      return { data: mockData };
    }
    return this.httpService.post({
      //url: `${this.dataServiceUrl}/biz/corp/infoAll?taxNo=91EFNLKPN7F18B2ETA`,
      url: `${this.dataServiceUrl}/biz/corp/infoAll?taxNo=${taxNo}`,
      data: { taxNo },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取可营销企业名单
   */
  async queryCorpCKInfo() {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/ai/queryCorpCKInfo/v1`,
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 发送钉钉消息通知
   */
  async sendDingding(params: { content: string; secret?: string }) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/ai/sendDingding/v1`,
      data: params,
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 查询企业税务风险列表
   * @param params 分页参数
   */
  async queryTaxRiskList(params: { pageNum: number; pageSize: number }) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/queryTaxRiskList/v1`,
      data: {
        orgNo: this.userContext.orgNo,
        orgChannelNo: this.userContext.orgChannelNo,
        orgChannelUserId: this.userContext.orgChannelUserId,
        pageNum: params.pageNum,
        pageSize: params.pageSize,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取企业风险报告
   * @param taxNo 企业税号
   */
  async getRiskReport(taxNo: string) {
    return this.httpService.post({
      url: `${this.serviceUrl}/institutionChannelBff/getRiskReport/v1`,
      data: {
        taxNo,
      },
      headers: {
        cookie: this.userContext.session,
      } as any,
    });
  }

  /**
   * 获取报告列表（直接调用 saasCheck 服务）
   * @param params 查询参数
   */
  async getReportList(params: {
    saasCheckUrl: string;
    taxNo: string;
    userId?: string;
    pageNum?: number;
    pageSize?: number;
  }) {
    return this.httpService.post({
      url: `${params.saasCheckUrl}/creditapi/report/queryReportList`,
      data: {
        taxNo: params.taxNo,
        userId: buildUserId(this.userContext.orgChannelUserId),
        pageNum: params.pageNum || 1,
        pageSize: params.pageSize || 10,
      },
    });
  }

  /**
   * 生成报告（直接调用 saasCheck 服务）
   * @param params 生成参数
   */
  async createReport(params: {
    saasCheckUrl: string;
    taxNo: string;
    userId?: string;
  }) {
    return this.httpService.post({
      url: `${params.saasCheckUrl}/creditapi/report/createReport`,
      data: {
        taxNo: params.taxNo,
        userId: buildUserId(this.userContext.orgChannelUserId),
        reportType: '6',
        reportName: '企业经营报告进阶版',
        reportUrl: '/saas/report/saasAdvancedReport',
        items: [
          { reportName: '税务分析', reportType: '03', viewStatus: '2' },
          { reportName: '经营分析', reportType: '04', viewStatus: '2' },
          { reportName: '行业地位分析', reportType: '05', viewStatus: '2' },
          { reportName: '销售分析', reportType: '06', viewStatus: '2' },
          { reportName: '企业信用详情', reportType: '07', viewStatus: '2' },
          { reportName: '采购分析', reportType: '08', viewStatus: '2' },
          { reportName: '概览', reportType: '09', viewStatus: '2' },
        ],
      },
    });
  }

  /**
   * 查询核心企业上下游 Top20 企业
   * @param params 查询参数
   */
  async queryTop20(params: Top20Request): Promise<Top20Response> {
    const requestParams = { limit: 10, ...params };
    if (isDev) {
      // return {
      //   success: true,
      //   returnCode: '0',
      //   returnMessage: 'success',
      //   data: {
      //     enterpriseId: '',
      //     direction: params.direction,
      //     partners: [],
      //   },
      // };
      return {
        success: true,
        returnCode: '0',
        returnMessage: 'success',
        data: {
          enterpriseId: 'ENT-001',
          direction: 'upstream',
          partners: [
            {
              enterpriseId: 'ENT-002',
              enterpriseName: '示例企业J有限公司',
              relationshipType: 'upstream',
              recommendationStars: 5,
              hopLevel: 1,
              willingness: 0.92,
              industry: '制造业',
              transactionAmount: 15000000.0,
              transactionCount: 120,
            },
            {
              enterpriseId: 'ENT-003',
              enterpriseName: '优质供应商B',
              relationshipType: 'upstream',
              recommendationStars: 5,
              hopLevel: 1,
              willingness: 0.88,
              industry: '原材料',
              transactionAmount: 12000000.0,
              transactionCount: 95,
            },
            {
              enterpriseId: 'ENT-021',
              enterpriseName: '潜在供应商X哈哈',
              relationshipType: 'downstream',
              recommendationStars: 2,
              hopLevel: 2,
              willingness: 0.65,
              industry: '物流运输',
              transactionAmount: null,
              transactionCount: null,
            },
          ],
        },
      };
    }
    try {
      const response = await this.httpService.post({
        url: `${this.relationshipServiceUrl}/enterprise/relationship/queryTop20`,
        data: requestParams,
        headers: {
          cookie: this.userContext.session,
        } as any,
      });

      const result = response.data;

      if (result && result.success) {
        return result as Top20Response;
      }

      return {
        success: false,
        returnCode: result?.returnCode || 'UNKNOWN',
        returnMessage: result?.returnMessage || '查询失败',
        data: {
          enterpriseId: '',
          direction: params.direction,
          partners: [],
        },
      };
    } catch (error) {
      return {
        success: false,
        returnCode: 'NETWORK_ERROR',
        returnMessage: '查询服务暂时不可用，请稍后重试',
        data: {
          enterpriseId: '',
          direction: params.direction,
          partners: [],
        },
      };
    }
  }

  /**
   * 查询企业上下游关系
   * @param params 查询参数
   */
  // @ts-ignore
  async queryEnterpriseRelationship(
    params: EnterpriseRelationshipRequest,
  ): Promise<EnterpriseRelationshipResponse> {
    if (isDev) {
      // 成功响应4：问题4查询，返回经过地区过滤的核心企业列表（needEnterpriseList=true）
      return {
        success: true,
        returnCode: '0',
        returnMessage: 'success',
        data: {
          enterpriseId: 'ENT-001',
          enterpriseName: '某制造企业',
          direction: 'both',
          isMatch: true,
          hasCoreConfig: true,
          message: '该企业与2家核心企业有上下游关系（已过滤地区）',
          matchedEnterprises: [
            {
              enterpriseId: 'CORE-001',
              enterpriseName: '老黑科技公司',
              relationshipType: 'upstream',
              transactionAmount: 15000000.0,
              transactionCount: 120,
              industry: '制造业',
              willingness: 0.92,
            },
            {
              enterpriseId: 'CORE-002',
              enterpriseName: '核心企业B（浙江）',
              relationshipType: 'downstream',
              transactionAmount: 8000000.0,
              transactionCount: 85,
              industry: '批发零售',
              willingness: 0.88,
            },
          ],
          total: 2,
        },
      };
      // 成功响应1：有机构核心企业配置，有匹配（needEnterpriseList=false）
      // return {
      //   success: true,
      //   returnCode: '0',
      //   returnMessage: 'success',
      //   data: {
      //     enterpriseId: 'ENT-001',
      //     enterpriseName: '某制造企业',
      //     direction: 'both',
      //     isMatch: true,
      //     hasCoreConfig: true,
      //     message: '该企业与2家核心企业有上下游关系',
      //     matchedEnterprises: [
      //       {
      //         enterpriseId: 'CORE-001',
      //         enterpriseName: '核心企业A',
      //         relationshipType: 'upstream',
      //         transactionAmount: 15000000.0,
      //         transactionCount: 120,
      //         industry: '制造业',
      //         willingness: 0.92,
      //       },
      //       // {
      //       //   enterpriseId: 'CORE-002',
      //       //   enterpriseName: '核心企业B',
      //       //   relationshipType: 'downstream',
      //       //   transactionAmount: 8000000.0,
      //       //   transactionCount: 85,
      //       //   industry: '批发零售',
      //       //   willingness: 0.88,
      //       // },
      //     ],
      //     total: 2,
      //   },
      // };
      //成功响应2：有机构核心企业配置，但无匹配（needEnterpriseList=false）
      // return {
      //   success: true,
      //   returnCode: '0',
      //   returnMessage: 'success',
      //   data: {
      //     enterpriseId: 'ENT-001',
      //     enterpriseName: '某制造企业',
      //     direction: 'upstream',
      //     isMatch: false,
      //     hasCoreConfig: true,
      //     message: '该企业与核心企业无上游关系',
      //     matchedEnterprises: [],
      //     total: 0,
      //   },
      // };
    }
    try {
      const response = await this.httpService.post({
        url: `${this.relationshipServiceUrl}/enterprise/relationship/query`,
        data: params,
        headers: {
          cookie: this.userContext.session,
        } as any,
      });

      const result = response.data;

      if (result && result.success) {
        return result as EnterpriseRelationshipResponse;
      }

      return {
        success: false,
        returnCode: result?.returnCode || 'UNKNOWN',
        returnMessage: result?.returnMessage || '查询失败',
        data: {
          enterpriseName: '',
          enterpriseId: '',
          direction: '',
          isMatch: false,
          hasCoreConfig: false,
          message: result?.returnMessage || '查询失败',
        },
      };
    } catch (error) {
      return {
        success: false,
        returnCode: 'NETWORK_ERROR',
        returnMessage: '查询服务暂时不可用，请稍后重试',
        data: {
          enterpriseName: '',
          enterpriseId: '',
          direction: '',
          isMatch: false,
          hasCoreConfig: false,
          message: '查询服务暂时不可用，请稍后重试',
        },
      };
    }
  }
  /**
   * 根据组合标签查询企业列表
   * POST /enterprise/relationship/queryByTags
   */
  async queryByTags(params: QueryByTagsRequest): Promise<QueryByTagsResponse> {
    // return {
    //   success: true,
    //   returnCode: '0',
    //   returnMessage: 'success',
    //   data: {
    //     enterprises: [
    //       {
    //         enterpriseId: 'ENT-001',
    //         enterpriseName: '浙江制造企业A',
    //         tags: {
    //           willingness: 0.92,
    //           industry: '制造业',
    //           recommendation_index: 0.95,
    //           province_code: '330000',
    //           city_code: '330100',
    //           county_code: '330102',
    //         },
    //       },
    //       {
    //         enterpriseId: 'ENT-002',
    //         enterpriseName: '杭州制造企业B',
    //         tags: {
    //           willingness: 0.88,
    //           industry: '制造业',
    //           recommendation_index: 0.91,
    //           province_code: '330000',
    //           city_code: '330100',
    //           county_code: '330106',
    //         },
    //       },
    //     ],
    //     total: 156,
    //     pageNum: 1,
    //     pageSize: 20,
    //     totalPages: 8,
    //   },
    //   total: 156,
    // };
    try {
      const response = await this.httpService.post({
        url: `${this.relationshipServiceUrl}/enterprise/relationship/queryByTags`,
        data: params,
        headers: {
          cookie: this.userContext.session,
        } as any,
      });

      const result = response.data;

      if (result && result.success) {
        return result as QueryByTagsResponse;
      }

      return {
        success: false,
        returnCode: result?.returnCode || 'UNKNOWN',
        returnMessage: result?.returnMessage || '查询失败',
        data: {
          enterprises: [],
          total: 0,
          pageNum: params.pageNum || 1,
          pageSize: params.pageSize || 20,
          totalPages: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        returnCode: 'NETWORK_ERROR',
        returnMessage: '查询服务暂时不可用，请稍后重试',
        data: {
          enterprises: [],
          total: 0,
          pageNum: params.pageNum || 1,
          pageSize: params.pageSize || 20,
          totalPages: 0,
        },
      };
    }
  }

  /**
   * 通过企业名称模糊搜索，返回最匹配的企业税号和名称
   */
  async searchEnterpriseByName(enterpriseName: string): Promise<{
    success: boolean;
    creditNo?: string;
    matchedName?: string;
    errorMessage?: string;
  }> {
    if (isDev) {
      if (enterpriseName.includes('明天')) {
        return {
          success: true,
          creditNo: '91UCR8LQ4306KCYA7D',
          matchedName: '示例企业A有限公司',
        };
      }

      if (enterpriseName.includes('示例企业J有限公司')) {
        return {
          success: true,
          creditNo: '91UCR8LQ4306KCYA7D',
          matchedName: '示例企业J有限公司',
        };
      }

      if (enterpriseName.includes('二狗子')) {
        return {
          success: true,
          creditNo: '916HUXJXU408LPH3Q0',
          matchedName: '示例企业BM有限公司',
        };
      }
    }

    const suggestResponse = await this.searchCompany(enterpriseName, 1);
    const dataArray = suggestResponse.data;

    if (
      !dataArray?.data ||
      !Array.isArray(dataArray.data) ||
      dataArray.data.length === 0
    ) {
      return {
        success: false,
        errorMessage: `未找到企业"${enterpriseName}"，请确认企业名称是否正确`,
      };
    }

    const matchedEnterprise = dataArray.data[0];
    const creditNo = matchedEnterprise.credit_no;
    const matchedName = matchedEnterprise.name;

    if (!creditNo) {
      return {
        success: false,
        matchedName,
        errorMessage: `未能获取企业"${matchedName}"的税号信息`,
      };
    }

    return { success: true, creditNo, matchedName };
  }

  /**
   * 验证企业名称并检查用户权限（内部方法）
   * 组合 searchEnterpriseByName + checkUserHasTaxNo
   * @param enterpriseName 企业名称
   * @returns 验证结果，包含税号和匹配的企业名称
   */
  async verifyEnterprise(enterpriseName: string): Promise<{
    success: boolean;
    taxNo?: string;
    matchedName?: string;
    errorMessage?: string;
  }> {
    if (enterpriseName.includes('明天')) {
      return {
        success: true,
        taxNo: '91UCR8LQ4306KCYA7D',
        matchedName: '示例企业A有限公司',
      };
    }
    const searchResult = await this.searchEnterpriseByName(enterpriseName);

    if (!searchResult.success || !searchResult.creditNo) {
      return {
        success: false,
        errorMessage:
          searchResult.errorMessage ||
          `未找到企业"${enterpriseName}"，请确认企业名称是否正确`,
      };
    }

    const { creditNo, matchedName } = searchResult;

    const checkResponse = await this.checkUserHasTaxNo(creditNo);
    // const checkResponse = await this.checkUserHasTaxNo("915YDFKWQM174M4NEH");
    // const matchedName = ''
    // const creditNo = ''

    this.logger.log(`checkResponse: ${JSON.stringify(checkResponse.data)}`);

    const denied = checkResponse.data?.success;

    if (!denied) {
      return {
        success: false,
        taxNo: creditNo,
        matchedName,
        errorMessage: `未查询到企业"${matchedName}"或您没有权限访问该企业。请确认：\n1. 该企业是否已添加到您的采集列表\n2. 您是否有权限访问该企业的数据`,
      };
    }

    return { success: true, taxNo: creditNo, matchedName };
  }

  /**
   * 查询两企业直接交易关系
   * @param params 企业A和企业B的税号
   */
  async queryDirectRelationship(
    params: DirectRelationshipRequest,
  ): Promise<DirectRelationshipResponse> {
    // Mock: 有上游关系
    // return {
    //   success: true,
    //   returnCode: '0',
    //   returnMessage: 'success',
    //   data: {
    //     enterpriseA: params.enterpriseA,
    //     enterpriseB: params.enterpriseB,
    //     isUpstream: true,
    //     isDownstream: false,
    //     hasTransaction: true,
    //     description: '企业A是企业B的上游供应商',
    //   },
    // };
    try {
      const response = await this.httpService.post({
        url: `${this.relationshipServiceUrl}/enterprise/relationship/queryDirect`,
        data: params,
        headers: {
          cookie: this.userContext.session,
        } as any,
      });

      const result = response.data;

      if (result && result.success) {
        return result as DirectRelationshipResponse;
      }

      return {
        success: false,
        returnCode: result?.returnCode || 'UNKNOWN',
        returnMessage: result?.returnMessage || '查询失败',
        data: {
          enterpriseA: params.enterpriseA,
          enterpriseB: params.enterpriseB,
          isUpstream: false,
          isDownstream: false,
          hasTransaction: false,
          description: '查询失败',
        },
      };
    } catch (error) {
      return {
        success: false,
        returnCode: 'NETWORK_ERROR',
        returnMessage: '查询服务暂时不可用，请稍后重试',
        data: {
          enterpriseA: params.enterpriseA,
          enterpriseB: params.enterpriseB,
          isUpstream: false,
          isDownstream: false,
          hasTransaction: false,
          description: '查询服务暂时不可用，请稍后重试',
        },
      };
    }
  }

  /**
   * 查询企业画像标签（tags）
   * POST /enterprise/relationship/queryDetail
   */
  async queryEnterpriseDetail(enterpriseIds: string[]): Promise<{
    success: boolean;
    data?: Array<{
      enterpriseId: string;
      enterpriseName: string;
      tags: string[];
      additionalInfo?: Record<string, any>;
    }>;
    errorMessage?: string;
  }> {
    // if (isDev) {
    //   return {
    //     success: true,
    //     tags: {
    //       willingness: 0.92,
    //       industry: '软件和信息技术服务业',
    //       recommendation_index: 0.95,
    //       credit_rating: 'AAA',
    //       annual_revenue: 50000000.0,
    //       employee_count: 200,
    //       province_code: '330000',
    //       city_code: '330100',
    //       county_code: '330102',
    //       registration_date: '2015-03-15',
    //       business_scope: '软件开发、技术咨询',
    //     },
    //     additionalInfo: {
    //       legal_representative: '张三',
    //       registered_capital: '10000000',
    //       company_type: '有限责任公司',
    //     },
    //   };
    // }
    try {
      let response: any = await this.httpService.post({
        url: `${this.relationshipServiceUrl}/enterprise/relationship/queryDetail`,
        data: { enterpriseIds },
        headers: {
          cookie: this.userContext.session,
        } as any,
      });

      if (isDev) {
        response = {
          data: {
            success: true,
            returnCode: '200',
            returnMessage: '成功',
            data: [
              {
                enterpriseId: '91UCR8LQ4306KCYA7D',
                enterpriseName: '示例企业A有限公司',
                tags: {
                  // is_high_school: 0,
                  // is_guoqi: 0,
                  // is_listed: 0,
                  // supplier_stability: '强稳定',
                  // industry_code: 'C4000',
                  // is_top_500: 1,
                  // city_code: '320200',
                  // province_code: '320000',
                  // is_gazelle: 0,
                  // is_unicorn: 1,
                  // city_name: '无锡市',
                  // tax_no: '912A83YJGPW54RG5TA',
                  // id: 'faa5277fb9311055f5246119cafd39a5',
                  // industry_name: '仪器仪表制造业',
                  // is_tech_small: 0,
                  // is_yangqi: 1,
                  // create_time: '2026-03-18 10:47:54',
                  // business_activity: 'A级',
                  // business_stability: '高稳定',
                  // corp_name: '示例企业N有限公司',
                  // is_spec: 0,
                  // province_name: '江苏',
                  // credit_lever: '',
                  // is_high_tech: 0,
                  // is_innovate: 0,
                  // is_hospital: 0,
                  // enterprise_scale: '疑似中型',
                },
                additionalInfo: null,
              },
              {
                enterpriseId: '91UCR8LQ4306KCYA7D',
                enterpriseName: '示例企业J有限公司',
                tags: {
                  is_high_school: 0,
                  is_guoqi: 1,
                  is_listed: 1,
                  supplier_stability: '强稳定',
                  industry_code: 'C4000',
                  is_top_500: 0,
                  is_gazelle: 0,
                  is_unicorn: 0,
                  industry_name: '仪器仪表制造业',
                  is_tech_small: 0,
                  is_yangqi: 1,
                  create_time: '2026-03-18 10:47:54',
                  business_activity: 'A级',
                  business_stability: '高稳定',
                  corp_name: '示例企业N有限公司',
                  is_spec: 0,
                  province_name: '江苏',
                  credit_lever: '',
                  is_high_tech: 0,
                  is_innovate: 0,
                  is_hospital: 0,
                  enterprise_scale: '疑似中型',
                },
                additionalInfo: null,
              },
              {
                enterpriseId: '91UCR8LQ4306KCYA7D',
                enterpriseName: '示例企业J有限公司2',
                tags: {
                  is_high_school: 0,
                  is_guoqi: 1,
                  is_listed: 1,
                  supplier_stability: '强稳定',
                  industry_code: 'C4000',
                  is_top_500: 0,
                  is_gazelle: 0,
                  is_unicorn: 0,
                  industry_name: '仪器仪表制造业',
                  is_tech_small: 0,
                  is_yangqi: 1,
                  create_time: '2026-03-18 10:47:54',
                  business_activity: 'A级',
                  business_stability: '高稳定',
                  corp_name: '示例企业N有限公司',
                  is_spec: 0,
                  province_name: '江苏',
                  credit_lever: '',
                  is_high_tech: 0,
                  is_innovate: 0,
                  is_hospital: 0,
                  enterprise_scale: '疑似中型',
                },
                additionalInfo: null,
              },
            ],
          },
        };
      }

      const result = response.data;

      if (result && result.success && result.data) {
        // result.data 现在是数组，每个元素包含 enterpriseId, enterpriseName, tags, additionalInfo
        const dataList: any[] = Array.isArray(result.data)
          ? result.data
          : [result.data];

        const enterprises = dataList.map((item: any) => {
          // const rawTags: Record<string, any> = item.tags || {};
          const rawTags: Record<string, any> = item.tags || {};
          const tagList: string[] = [];

          for (const [label, fieldName] of Object.entries(TAG_FIELD_MAP)) {
            const val = rawTags[fieldName];
            if (typeof val === 'number') {
              if (val === 1) {
                tagList.push(label);
              }
            } else if (!fieldName.startsWith('is_')) {
              tagList.push(`${label}：${val || '--'}`);
            }
          }

          return {
            enterpriseId: item.enterpriseId || '',
            enterpriseName: item.enterpriseName || '',
            tags: tagList,
            additionalInfo: item.additionalInfo || {},
          };
        });

        return {
          success: true,
          data: enterprises,
        };
      }

      return {
        success: false,
        errorMessage: result?.returnMessage || '查询企业画像失败',
      };
    } catch (error: any) {
      return {
        success: false,
        errorMessage: `企业画像查询异常: ${error.message}`,
      };
    }
  }
}
