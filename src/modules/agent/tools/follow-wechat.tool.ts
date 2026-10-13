/**
 * 关注公众号工具
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createFollowWechatTool() {
  return new DynamicStructuredTool({
    name: 'follow_wechat',
    description: `
返回关注微信公众号的方式和二维码信息。

使用场景：
- 用户询问如何关注公众号
- 用户想要获取公众号信息
- 用户问"怎么关注"、"公众号是什么"
- 用户想要获取最新动态和授权信息

返回：关注公众号的两种方式和二维码图片，这是一个完整的markdown，不需要解析内容，直接返回即可
    `.trim(),
    schema: z.object({
      // 不需要任何参数
    }),
    func: async () => {
      return `**方式1**:打开微信搜索公众号 "ExampleBot"，点击关注。<br>**方式2**:长按保存下方二维码，使用微信扫一扫关注"ExampleBot"，第一时间获取授权动态。![二维码图片](https://fintech.example.com/institutionChannelAgent/qrcode.jpg)`;
    },
  });
}
