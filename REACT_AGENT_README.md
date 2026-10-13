# ReAct Agent 实现文档

## 概述

这是一个基于 LangGraph 的 **ReAct (Reasoning + Acting) 智能体**，能够自主决策、灵活使用工具，而不是基于意图分类的工作流。

## 核心特性

### ✅ 自主决策
- Agent 自己理解用户意图
- 自主选择合适的工具
- 可以组合多个工具完成复杂任务

### ✅ 自然语言理解
- 不依赖关键词匹配
- 理解各种表达方式
- 支持多轮对话和上下文记忆

### ✅ 工具驱动
- 通过工具描述让 LLM 理解何时使用
- 添加新工具无需修改核心逻辑
- 工具之间相互独立

### ✅ 流式输出
- 支持 SSE 流式响应
- 实时展示工具调用过程
- 提升用户体验

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         用户输入                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Agent 节点：LLM 推理                                         │
│  - 理解用户意图                                               │
│  - 决定是否需要使用工具                                        │
│  - 如果需要，选择哪个工具和参数                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
                   是否                 否
                 需要工具？              │
                    │                   │
                   是                   ↓
                    ↓            ┌──────────────┐
         ┌──────────────────┐   │  生成最终回答  │
         │  Tools 节点       │   └──────────────┘
         │  - 执行工具调用    │          ↓
         │  - 获取结果       │   ┌──────────────┐
         └──────────────────┘   │  返回给用户    │
                    ↓            └──────────────┘
         ┌──────────────────┐
         │  观察工具结果      │
         └──────────────────┘
                    ↓
         ┌──────────────────┐
         │  Agent 节点       │
         │  - 分析工具结果    │
         │  - 决定下一步     │
         └──────────────────┘
                    ↓
            （循环直到完成）
```

## 目录结构

```
src/modules/agent/
├── config/
│   └── agent.config.ts          # Agent 配置
├── dto/
│   └── agent.dto.ts             # 数据传输对象
├── graph/
│   ├── state.ts                 # Agent 状态定义
│   └── react-agent.ts           # ReAct Agent 创建器
├── prompts/
│   └── system-prompt.ts         # 系统提示词
├── session/
│   └── session.manager.ts       # 会话管理器
├── tools/
│   ├── index.ts                 # 工具工厂
│   ├── order-query.tool.ts      # 订单查询工具
│   ├── report-query.tool.ts     # 报告查询工具
│   ├── collection-progress.tool.ts  # 采集进度工具
│   └── collection-link.tool.ts  # 采集链接工具
├── types/
│   └── agent.types.ts           # 类型定义
├── agent.controller.ts          # 控制器
├── agent.service.ts             # 核心服务
└── agent.module.ts              # 模块定义
```

## 可用工具

### 1. query_orders - 订单查询
查询用户的采集订单列表。

**使用场景**：
- 用户想知道有哪些企业已经采集
- 用户询问订单信息、订单列表

**示例**：
- "我有哪些订单？"
- "帮我看看我都采集了哪些企业"

### 2. report_interp - 报告查询
查询企业的完整报告数据。

**使用场景**：
- 用户想了解某个企业的详细信息
- 用户询问企业的财务、税务、开票等数据

**示例**：
- "帮我看看XX公司的详细情况"
- "XX企业的开票金额是多少？"

### 3. check_collection_progress - 采集进度
查询企业数据采集进度。

**使用场景**：
- 用户想知道某个企业的采集进度
- 用户询问"采集完成了吗"

**示例**：
- "XX公司采集完成了吗？"
- "采集进度如何？"

### 4. generate_collection_link - 采集链接
生成企业数据采集链接。

**使用场景**：
- 用户想要采集新企业
- 用户询问"怎么采集"

**示例**：
- "我想采集一个新企业"
- "给我采集链接"

## 配置说明

### 环境变量

在 `config.dev.yaml` 或环境变量中配置：

```yaml
agent:
  # 后端服务 URL
  SERVICE_URL: 'https://www-pre.example.com'

  # LLM 配置
  AGENT_MODEL_NAME: 'Doubao-1.5-pro-32k'
  AGENT_API_KEY: 'your-api-key'
  AGENT_BASE_URL: 'https://api.302.ai/v1'
  AGENT_TEMPERATURE: 0.7
  AGENT_MAX_TOKENS: 2000

  # 知识库配置
  AGENT_KB_ENABLED: false
  AGENT_KB_TOP_K: 4

  # 会话配置
  AGENT_SESSION_MAX_AGE: 3600000  # 1小时
```

## API 使用

### POST /agent/chat

发送聊天消息给 Agent。

**请求体**：
```json
{
  "prompt": "我有哪些订单？",
  "orgNo": "ORG0000000000000000A",
  "orgChannelNo": "OC000000000000000000",
  "orgChannelUserId": 15,
  "session": "your-session-cookie"
}
```

**响应**：SSE 流式响应

```
data: {"content":"您"}
data: {"content":"有"}
data: {"content":"以下"}
data: {"content":"采集"}
data: {"content":"订单"}
...
```

### POST /agent/stats

获取会话统计信息。

**响应**：
```json
{
  "totalSessions": 10,
  "activeSessions": 3
}
```

## 测试

### 使用 HTTP 文件测试

```bash
# 使用 test-react-agent.http 文件
# 需要安装 REST Client 扩展
```

### 使用 curl 测试

```bash
curl -X POST http://localhost:8025/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "我有哪些订单？",
    "orgNo": "ORG0000000000000000A",
    "orgChannelNo": "OC000000000000000000",
    "orgChannelUserId": 15,
    "session": "your-session-cookie"
  }'
```

## 运行

### 开发模式

```bash
npm run dev
```

### 生产模式

```bash
npm run build
npm run start:prod
```

## 示例场景

### 场景 1：简单查询
```
用户："我有哪些订单？"

Agent 思考：用户想查看订单列表
→ 调用 query_orders 工具
→ 获得订单列表
→ 格式化展示给用户
```

### 场景 2：复杂分析
```
用户："帮我分析一下XX公司的财务状况，看看值不值得合作"

Agent 思考：需要企业的详细报告数据
→ 调用 query_orders 查找企业税号
→ 调用 report_interp 获取报告数据
→ 分析财务指标（营收、利润、负债率等）
→ 综合评估并给出建议
```

### 场景 3：多轮对话
```
用户："我想看看我的订单"
Agent：调用 query_orders → 展示订单列表

用户："第一个企业的详细情况"
Agent：从上下文获取第一个企业的税号 → 调用 report_interp → 展示详细报告

用户："开票金额是多少？"
Agent：从刚才的报告数据中提取开票金额 → 回答
```

## 添加新工具

### 1. 创建工具文件

```typescript
// src/modules/agent/tools/new-tool.tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createNewTool(httpService, userContext, serviceUrl) {
  return new DynamicStructuredTool({
    name: 'new_tool',
    description: `
      工具的详细描述。
      
      使用场景：
      - 场景1
      - 场景2
      
      返回：返回内容说明
    `,
    schema: z.object({
      param1: z.string().describe('参数1说明'),
      param2: z.number().optional().describe('参数2说明（可选）'),
    }),
    func: async (input) => {
      // 实现工具逻辑
      return '工具执行结果';
    },
  });
}
```

### 2. 注册工具

```typescript
// src/modules/agent/tools/index.ts
import { createNewTool } from './new-tool.tool';

export function createAgentTools(httpService, userContext, serviceUrl) {
  return [
    createOrderQueryTool(httpService, userContext, serviceUrl),
    createReportQueryTool(httpService, userContext, serviceUrl),
    createCollectionProgressTool(httpService, userContext, serviceUrl),
    createCollectionLinkTool(userContext, serviceUrl),
    createNewTool(httpService, userContext, serviceUrl), // 添加新工具
  ];
}
```

### 3. 完成！

Agent 会自动学会使用新工具，无需修改其他代码。

## 优化建议

### 1. 工具描述优化

工具描述是 Agent 决策的关键，要：
- 清晰说明工具的功能
- 列出具体的使用场景
- 说明参数的含义
- 说明返回值的格式

### 2. 系统提示词优化

根据实际使用情况，优化系统提示词：
- 添加更多示例
- 强调重要规则
- 调整回答风格

### 3. 性能优化

- 实现工具结果缓存
- 优化 LLM 调用次数
- 使用更快的模型（如 gpt-3.5-turbo）

### 4. 错误处理

- 添加重试机制
- 实现熔断器模式
- 优化错误消息

## 常见问题

### Q1: Agent 不调用工具怎么办？

**原因**：工具描述不够清晰

**解决**：优化工具描述，明确使用场景

### Q2: Agent 调用了错误的工具？

**原因**：多个工具的描述相似

**解决**：明确区分工具的使用场景

### Q3: Agent 响应太慢？

**原因**：LLM 推理需要时间

**解决**：
1. 使用更快的模型
2. 实现流式输出
3. 优化工具实现

### Q4: 如何调试 Agent？

**方法**：查看日志中的工具调用信息

```typescript
this.logger.log(`Tool call: ${toolCall.name}`);
this.logger.log(`Tool input: ${JSON.stringify(toolCall.args)}`);
```

## 对比旧实现

### 旧实现（工作流）
- ❌ 18 种预定义意图
- ❌ 固定的 if-else 路由
- ❌ 无法处理复杂任务
- ❌ 代码量大（~2000 行）

### 新实现（ReAct Agent）
- ✅ 无需意图分类
- ✅ 自主决策
- ✅ 可以处理任意复杂任务
- ✅ 代码量小（~500 行）

## 参考资料

- [LangChain 文档](https://js.langchain.com/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraphjs/)
- [ReAct 论文](https://arxiv.org/abs/2210.03629)

## 许可证

MIT
