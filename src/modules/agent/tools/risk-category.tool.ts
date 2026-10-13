/**
 * 风险类别说明工具
 * 返回系统可识别的风险维度说明，无外部依赖
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 创建风险类别说明工具（Task 4.1）
 */
export function createRiskCategoryTool() {
  return new DynamicStructuredTool({
    name: 'risk_category',
    description: `
风险类别说明。当用户提到"风险类别"、"风险维度"、"从哪些方面识别风险"等关键词时必须调用此工具。

使用场景：
- 用户询问"从哪些方面识别风险"
- 用户询问"风险类别"
- 用户询问"风险维度"

功能：
返回系统可识别的5个风险维度说明

返回：固定文案，内容必须全部输出
    `.trim(),
    schema: z.object({}),
    func: async () => {
      return '我会从企业身份、经营风险、交易结构风险、朋友圈风险、信用历史5方面扫描企业是否存在风险，针对命中的风险做出提醒。';
    },
  });
}
