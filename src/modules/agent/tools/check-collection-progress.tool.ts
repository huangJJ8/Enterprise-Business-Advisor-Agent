/**
 * 采集进度查询工具
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';
import { getCombineStatusText } from 'src/types/types';

export function createCollectionProgressTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'check_collection_progress',
    description: `
查询企业数据采集进度。

使用场景：
- 用户想知道某个企业的采集进度
- 用户询问"采集完成了吗"、"采集进度如何"
- 用户想了解采集状态
- 用户问"XX企业采集到哪一步了"

返回：采集状态描述，如果采集状态为完成，那么在结尾添加 <go input="对xx报告进行解读">查看报告解读</go>\n\n<go input="查看xx报告详情">查看报告详情</go>
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"'),
    }),
    func: async (input) => {
      try {
        // 内部自动完成企业验证和权限校验
        const verifyResult = await agentApiService.verifyEnterprise(input.enterpriseName);
        if (!verifyResult.success) {
          return verifyResult.errorMessage!;
        }
        const corpName = verifyResult.matchedName!;

        // 查询订单数据获取采集状态
        const orderResponse = await agentApiService.listTaxNoInfo({
          corpName,
          pageNum: 1,
          pageSize: 10,
        });

        const orderList = orderResponse.data?.data?.list || [];
        
        if (orderList.length === 0) {
          return `未找到企业"${corpName}"的采集数据，请确认该企业是否已添加到采集列表`;
        }

        // 找到匹配的企业订单
        const order = orderList.find((item: any) => item.corpName === corpName) || orderList[0];
        
        const status = getCombineStatusText(order.combineStatus);

        return `企业名称：${order.corpName}
采集状态：${status}`;
      } catch (error: any) {
        return `查询采集进度失败: ${error.message}`;
      }
    },
  });
}
