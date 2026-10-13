/**
 * 订单查询工具
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LoggerService } from 'src/modules-global/logger/service';
import { AgentApiService } from '../api.service';
import { getCollectionOrderPages } from './utils/pages';
//

export function createOrderQueryTool({
  agentApiService,
  logger,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
}) {
  return new DynamicStructuredTool({
    name: 'query_orders',
    description: `
查询用户的采集订单列表。

使用场景：
- 用户想知道有哪些企业已经采集
- 用户询问订单信息、订单列表
- 用户想查看企业列表
- 用户问"我有哪些订单"、"我采集了哪些企业"等

返回：订单列表，包含企业名称、采集状态等信息、<g3>和<pages>标签，内容必须全部输出，在内容要完整输出基础上可以在开头和结尾加简短说明
    `.trim(),
    schema: z.object({
      pageNum: z.number().default(1).describe('页码，默认为1'),
    }),
    func: async (input) => {
      try {
        const response = await agentApiService.listTaxNoInfo({
          corpName: "",
          pageNum: input.pageNum,
          pageSize: 5,
        });

        logger.log('response: ' + JSON.stringify(response.data));

        const result = getCollectionOrderPages({
          json: response.data,
          listTitle: '采集记录如下，请选择您要解读的企业：',
        });

        return `${result.answer.trim()}(以上内容原样输出)`;
      } catch (error: any) {
        return `查询订单失败: ${error.message}`;
      }
    },
  });
}
