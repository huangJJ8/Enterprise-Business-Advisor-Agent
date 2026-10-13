/**
 * 工具工厂 - 创建所有 Agent 工具
 */
import { LoggerService } from 'src/modules-global/logger/service';
import { CacheManager } from 'src/modules/upload/services/cache-manager.service';
import { AgentApiService } from '../api.service';
import { AgentConfig } from '../config/agent.config';
import { UserContext, UserInfo } from '../types/agent.types';
import { AuthCheckerService } from '../services/auth-checker.service';
import { createOrderQueryTool } from './query-orders.tool';
import { createReportInterpTool } from './report-interp.tool';
import { createReportDetailTool } from './report-detail.tool';
import { createCollectionProgressTool } from './check-collection-progress.tool';
import { createCollectionLinkTool } from './generate-collection-link.tool';
// createProductMatchTool 已从智能体中移除，工具文件保留
import { createMarketingOpportunityTool } from './get-marketing-opportunities.tool';
import { createFollowWechatTool } from './follow-wechat.tool';
import { createCreditProductListTool } from './query-credit-product-list.tool';
import { createAdmissionQueryTool } from './check-admission.tool';
import { createEnterpriseTagSearchTool } from './search-enterprise-by-tag.tool';
import { createCorpStatusTool } from './check-corp-status.tool';
import { createAdmissionListTool } from './query-admission-list.tool';
import { createBusinessInfoTool } from './query-business-info.tool';
import { createMarketableListTool } from './query-marketable-list.tool';
import { createCoreEnterpriseTool } from './check-core-enterprise.tool';
// custom-report 工具已废弃，改为 processFilesAsync 后台直接生成参照表
// import { createCustomReportTool } from './custom-report.tool';
import { createRiskListTool } from './risk-list.tool';
import { createRiskDetailTool } from './risk-detail.tool';
import { createRiskCategoryTool } from './risk-category.tool';
import { createEnterpriseRelationshipTool } from './enterprise-relationship.tool';
import { createQueryTop20Tool } from './query-top20.tool';
import { createDirectRelationshipTool } from './query-direct-relationship.tool';
import { createQueryByTagsTool } from './query-by-tags.tool';
import { createGetReportAnswerUserTool } from './get-report-answer-user.tool';
import { createQueryEnterpriseTagsTool } from './query-enterprise-tags.tool';
import { createAnnualReportTool } from './annual-report.tool';

export function createAgentTools({
  agentApiService,
  logger,
  config,
  userContext,
  cacheManager,
  userInfo,
  authCheckerService,
  userQuery,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
  config: AgentConfig;
  userContext: UserContext;
  cacheManager: CacheManager;
  userInfo: UserInfo;
  authCheckerService: AuthCheckerService;
  userQuery: string;
}) {
  return [
    createOrderQueryTool({ agentApiService, logger }),
    createReportInterpTool({ agentApiService, logger, config, userContext, userInfo, authCheckerService, userQuery }),
    createReportDetailTool({ agentApiService, logger, config, userContext }),
    createCollectionProgressTool({ agentApiService }),
    createCollectionLinkTool({ agentApiService }),
    // createProductMatchTool 已从智能体中移除
    createMarketingOpportunityTool({ agentApiService, logger }),
    createFollowWechatTool(),
    createCreditProductListTool({ agentApiService }),
    createAdmissionQueryTool({ agentApiService }),
    createEnterpriseTagSearchTool({ agentApiService, logger }),
    createCorpStatusTool({ agentApiService }),
    createAdmissionListTool({ agentApiService, logger }),
    createBusinessInfoTool({ agentApiService }),
    createMarketableListTool({ agentApiService }),
    createCoreEnterpriseTool({ agentApiService }),
    // createCustomReportTool 已废弃
    createRiskListTool({ agentApiService, logger }),
    createRiskDetailTool({ agentApiService, logger, userInfo, authCheckerService, userQuery }),
    createRiskCategoryTool(),
    createEnterpriseRelationshipTool({ agentApiService, logger, userInfo, config, cacheManager, authCheckerService, userQuery }),
    createQueryTop20Tool({ agentApiService, logger, userInfo, authCheckerService, userQuery }),
    createDirectRelationshipTool({ agentApiService, logger }),
    createQueryByTagsTool({ agentApiService, logger, userInfo }),
    createGetReportAnswerUserTool({ agentApiService, logger }),
    createQueryEnterpriseTagsTool({ agentApiService, logger }),
    createAnnualReportTool(),
  ];
}

export * from './query-orders.tool';
export * from './report-interp.tool';
export * from './report-detail.tool';
export * from './check-collection-progress.tool';
export * from './generate-collection-link.tool';
// export * from './match-products.tool'; // 已从智能体中移除
export * from './get-marketing-opportunities.tool';
export * from './follow-wechat.tool';
export * from './query-credit-product-list.tool';
export * from './check-admission.tool';
export * from './search-enterprise-by-tag.tool';
export * from './check-corp-status.tool';
export * from './query-admission-list.tool';
export * from './query-business-info.tool';
export * from './query-marketable-list.tool';
export * from './check-core-enterprise.tool';
// export * from './custom-report.tool'; // 已废弃
export * from './risk-list.tool';
export * from './risk-detail.tool';
export * from './risk-category.tool';
export * from './enterprise-relationship.tool';
export * from './query-top20.tool';
export * from './query-direct-relationship.tool';
export * from './query-by-tags.tool';
export * from './get-report-answer-user.tool';
export * from './query-enterprise-tags.tool';
export * from './annual-report.tool';
