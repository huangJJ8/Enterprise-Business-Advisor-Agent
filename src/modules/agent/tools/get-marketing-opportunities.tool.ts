/**
 * 营销商机工具
 * 用于查询营销相关的商机信息
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import { getMarketingOpportunityPages } from './utils/pages';

export function createMarketingOpportunityTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'get_marketing_opportunities',
    description: `
示例银行营销商机查询工具。仅当用户明确提到"示例银行"关键字时才调用此工具。

⚠️ 【关键判断规则】：
- 必须包含"示例银行"关键字才能使用本工具，例如："示例银行营销商机"、"示例银行商机"、"示例银行的营销机会"
- 如果用户只说"营销商机"、"商机"、"营销机会"等（不含"示例银行"），禁止使用本工具，应使用 query_marketable_list

使用场景：
- 用户询问"示例银行营销商机"
- 用户说"示例银行营销商机第X页"（必须传入 pageNum 参数）
- 用户问"示例银行有哪些营销机会"
- 用户想查看示例银行商机列表

功能：
获取示例银行定制营销商机列表，支持分页查询

参数：
- pageNum: 页码（必填，从用户输入中提取，如"第7页"则传入7）

返回：示例银行营销商机列表（人类语言描述），包含<go>和<pages>标签，内容必须全部输出
    `.trim(),
    schema: z.object({
      pageNum: z.number().describe('页码，从用户输入中提取，如"第7页"则传入7，如果用户没有指定则传入1'),
    }),
    func: async (input) => {
      try {
        const response = await agentApiService.getMarketingOpportunityList({
          pageNum: input.pageNum,
          pageSize: 10,
        });

        // console.log('==response===', response.data);
        // response.data.data = {
        //   total: 425,
        //   pages: 43,
        //   list: [
        //     {
        //       taxNo: '916FUQY9Y32849LFBY',
        //       corpName: '示例企业AA有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91251EDN4CX4R0NHXG',
        //       corpName: '示例企业AU有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91CECBCYQBEW95X87U',
        //       corpName: '示例企业BD有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91E3M6JYCA1LLNB6TJ',
        //       corpName: '示例企业AV有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91F0PHDT7YNCLNTGJH',
        //       corpName: '示例企业AW有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91N5WPFRY8P85MKK81',
        //       corpName: '示例企业BH有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '917J6RR3Y6CWGMR250',
        //       corpName: '示例企业BB有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '916UG5MUGY83LNCYW8',
        //       corpName: '示例企业BL有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91QYTTDF57PC00LR1F',
        //       corpName: '示例企业AX有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //     {
        //       taxNo: '91XYEDY3G4YBMTCPLM',
        //       corpName: '示例企业BF有限公司',
        //       combineStatus: '4',
        //       showReportFlag: '0',
        //       taxNoTime: '2025-07-11 14:46:18',
        //       collectTime: '2025-12-01 14:03:51',
        //     },
        //   ],
        //   pageNum: input.pageNum,
        // };

        const result = getMarketingOpportunityPages({
          json: response.data,
          listTitle: '营销商机列表：',
        });

        logger.log('==工具返回结果=== ' + result.answer);

        return result.answer;
      } catch (error: any) {
        return `查询营销商机失败: ${error.message}`;
      }
    },
  });
}
