/**
 * 采集链接生成工具
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentApiService } from '../api.service';

export function createCollectionLinkTool({
  agentApiService,
}: {
  agentApiService: AgentApiService;
}) {
  return new DynamicStructuredTool({
    name: 'generate_collection_link',
    description: `
生成企业数据采集链接或二维码。

使用场景：
- 用户想要采集新企业
- 用户询问"怎么采集"、"如何采集数据"
- 用户需要采集链接或二维码
- 用户问"我要采集"、"给我采集链接"

返回：采集链接的url、二维码的base64编码、三个go标签，分别对应查看采集进度、数据采集需要多久？、关注我，随时获取最新授权动态！
    `.trim(), // 返回：工具函数返回的内容直接输出，不要做任何修饰、总结或添加额外说明，因为要输出的内容已经非常完整，不需要加工。

    schema: z.object({}),

    func: async () => {
      try {
        const response = await agentApiService.getRpaLinkUrl();

        const data = response.data?.data;

        if (!data) {
          return response.data?.message || '获取采集链接失败';
        }

        let answer = ``;
        answer += `请使用如下二维码或链接进行数据采集\n\n<qrcode url="${data.url}"></qrcode>\n\n[${data.url}](${data.url})\n\n`;
        answer += `<g1 input="关注我，随时获取最新授权动态！">关注我，随时获取最新授权动态！</g1>\n\n`;
        answer += `<g1 input="查看采集进度">查看采集进度</g1>\n\n`;
        answer += `<g1 input="数据采集需要多久？">数据采集需要多久？</g1>\n\n（以上内容原样返回）`;
        // answer += `@{app}#[{"t":0,"l":[{"x":"查看采集进度"},{"x":"数据采集需要多久？"}]}]`;
        return answer;
      } catch (error: any) {
        return `获取采集链接失败：${error.message}`;
      }
    },
  });
}
