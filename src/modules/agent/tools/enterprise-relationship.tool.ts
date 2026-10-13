/**
 * 企业上下游关系查询工具
 * 查询企业与核心企业的上下游关系，支持返回匹配的核心企业名单
 * 支持自定义核心企业数据接收与 LLM 解析
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { CacheManager } from 'src/modules/upload/services/cache-manager.service';
import { AgentApiService } from '../api.service';
import { AgentConfig } from '../config/agent.config';
import { LoggerService } from 'src/modules-global/logger/service';
import { UserInfo } from '../types/agent.types';
import { AuthCheckerService } from '../services/auth-checker.service';

const DIRECTION_LABELS: Record<string, string> = {
  upstream: '上游',
  downstream: '下游',
  both: '上下游',
};

/**
 * 使用 LLM 从文本中解析企业名称列表
 */
async function parseEnterpriseNamesWithLLM(
  content: string,
  config: AgentConfig,
  logger: LoggerService,
): Promise<string[]> {
  const llm = new ChatOpenAI({
    modelName: config.modelName,
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseURL },
    temperature: 0,
    maxTokens: 4096,
    streaming: false,
  });

  const prompt = `从以下文本中提取所有企业名称，返回 JSON 数组格式。只返回 JSON 数组，不要包含其他内容。
如果没有找到任何企业名称，返回空数组 []。

文本内容：
${content}`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const responseText = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

  // 提取 JSON 数组
  const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) {
    logger.warn('LLM 返回内容中未找到 JSON 数组');
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item: any) => typeof item === 'string' && item.trim().length > 0);
}

export function createEnterpriseRelationshipTool({
  agentApiService,
  logger,
  userInfo,
  config,
  cacheManager,
  authCheckerService,
  userQuery,
}: {
  agentApiService: AgentApiService;
  logger: LoggerService;
  userInfo: UserInfo;
  config: AgentConfig;
  cacheManager: CacheManager;
  authCheckerService: AuthCheckerService;
  userQuery: string;
}) {
  return new DynamicStructuredTool({
    name: 'enterprise_relationship',
    description: `
查询企业与核心企业的上下游关系。

使用场景：
- 用户询问"XX企业是否在核企上下游"
- 用户询问"XX企业是否在核企上游"
- 用户询问"XX企业是否在核企下游"
- 用户询问"XX企业与哪些核企有交易"
- 用户通过自定义核企上传组件提交了文件和/或富文本内容

返回：企业与核心企业的上下游关系查询结果
    `.trim(),
    schema: z.object({
      enterpriseName: z.string().min(1).describe('企业名称（必填，不能为空）。必须从用户的问题或对话上下文中提取企业全称传入，例如用户问"Acme 科技股份有限公司南京分公司报告"，则传入"Acme 科技股份有限公司南京分公司"。必须严格使用用户原文中的企业名称，禁止自行补全或修改，后续会通过模糊搜索匹配'),
      direction: z
        .enum(['upstream', 'downstream', 'both'])
        .describe('查询方向：upstream=上游，downstream=下游，both=上下游'),
      needEnterpriseList: z
        .boolean()
        .describe('是否需要返回核心企业名单'),
      tempId: z
        .string()
        .optional()
        .describe('自定义核企上传的临时ID (Temp_ID)，用户通过上传组件提交文件时使用'),
      textContent: z
        .string()
        .optional()
        .describe('用户输入的富文本内容，包含核心企业名称'),
    }),
    func: async (input) => {
      const directionLabel = DIRECTION_LABELS[input.direction];
      logger.log(`[enterprise_relationship] 入参: ${JSON.stringify(input)}`);

      try {
        // 1. 通过企业名称搜索获取税号
        const searchResult = await agentApiService.searchEnterpriseByName(
          input.enterpriseName,
        );
        logger.log(`[enterprise_relationship] 企业搜索结果: ${JSON.stringify(searchResult)}`);

        if (!searchResult.success || !searchResult.creditNo) {
          return '用户输入的企业错误！请确认企业名称后再次查询！';
        }

        const taxNo = searchResult.creditNo;

        // 授权校验拦截
        const authResult = await authCheckerService.checkAuthAndBuildResponse({
          orgNo: userInfo.orgNo,
          corpTaxNo: taxNo,
          enterpriseName: input.enterpriseName,
          subjectName: input.enterpriseName,
          originalQuestion: userQuery,
          operatorUserId: userInfo.id,
          operatorUserName: userInfo.name || '',
        });
        logger.log(`[enterprise_relationship] 授权校验结果: hasAuth=${authResult.hasAuth}`);

        if (!authResult.hasAuth) {
          return authResult.responseMessage!;
        }

        // 2. 自定义核心企业数据处理（通过 tempId 从缓存获取文件内容，或直接使用 textContent）
        if (input.tempId || input.textContent) {
          let customEnterpriseNames: string[] = [];

          try {
            // 通过 tempId 从缓存获取上传的文件内容
            if (input.tempId) {
              const cachedData = cacheManager.get(input.tempId);
              logger.log(`[enterprise_relationship] 缓存数据: tempId=${input.tempId}, found=${!!cachedData}`);
              if (!cachedData) {
                return '上传数据已过期或不存在，请重新上传文件';
              }

              // 解析文件内容中的企业名称
              for (const dataContent of cachedData.dataContents) {
                const contentStr = typeof dataContent === 'string' ? dataContent : dataContent.content;
                if (contentStr && contentStr.trim()) {
                  const fileNames = await parseEnterpriseNamesWithLLM(
                    contentStr,
                    config,
                    logger,
                  );
                  customEnterpriseNames.push(...fileNames);
                }
              }

              cacheManager.markUsed(input.tempId);
            }

            // 解析富文本内容中的企业名称
            if (input.textContent && input.textContent.trim()) {
              const textNames = await parseEnterpriseNamesWithLLM(
                input.textContent,
                config,
                logger,
              );
              customEnterpriseNames.push(...textNames);
            }

            logger.log(`[enterprise_relationship] 解析出的自定义核企名称: ${JSON.stringify(customEnterpriseNames)}`);
            // 合并去重
            customEnterpriseNames = [...new Set(customEnterpriseNames)];
            logger.log(`[enterprise_relationship] 去重后核企名称(${customEnterpriseNames.length}个): ${JSON.stringify(customEnterpriseNames)}`);

            if (customEnterpriseNames.length === 0) {
              return '未能从提交的内容中解析出企业名称，请检查文件或文本内容后重新提交。';
            }

            // 使用自定义核企名单进行二次查询（customMode=false）
            const customResponse = await agentApiService.queryEnterpriseRelationship({
              taxNo,
              orgNo: userInfo.orgNo,
              direction: input.direction,
              customMode: true,
              needEnterpriseList: true,
            });
            logger.log(`[enterprise_relationship] 自定义核企查询结果: ${JSON.stringify(customResponse)}`);

            if (customResponse.returnCode === '40404') {
              return '企业未找到';
            }

            if (customResponse.returnCode === 'NETWORK_ERROR') {
              return '查询服务暂时不可用，请稍后重试';
            }

            const { isMatch: customIsMatch, matchedEnterprises: customMatched } = customResponse.data;

            // 将 API 返回的匹配企业与用户上传的自定义名单做交叉比对
            if (customIsMatch && customMatched && customMatched.length > 0) {
              const actualMatched = customMatched.filter((e) =>
                customEnterpriseNames.some(
                  (name) => e.enterpriseName && e.enterpriseName.includes(name) || name.includes(e.enterpriseName),
                ),
              );
              logger.log(`[enterprise_relationship] 交叉比对结果: ${actualMatched.length}/${customMatched.length} 匹配`);

              if (actualMatched.length > 0) {
                const matchedListText = actualMatched
                  .map((e) => `- ${e.enterpriseName}（${DIRECTION_LABELS[e.relationshipType]}）`)
                  .join('\n');
                return `基于您提供的自定义核心企业名单，该企业在核心企业${directionLabel}。\n\n匹配的核心企业：\n${matchedListText}`;
              } else {
                return `基于您提供的自定义核心企业名单，该企业不在核心企业${directionLabel}。`;
              }
            } else {
              return `基于您提供的自定义核心企业名单，该企业不在核心企业${directionLabel}。`;
            }
          } catch (parseError: any) {
            logger.error(
              `自定义核企文件解析失败: ${parseError.message}`,
              parseError.stack,
            );
            return '文件解析失败，请检查文件格式后重新上传';
          }
        }

        // 3. 常规查询：调用企业上下游关系查询 API
        const response = await agentApiService.queryEnterpriseRelationship({
          taxNo,
          orgNo: userInfo.orgNo,
          direction: input.direction,
          customMode: false,
          needEnterpriseList: input.needEnterpriseList,
        });
        logger.log(`[enterprise_relationship] 常规查询结果: ${JSON.stringify(response)}`);

        // 4. 处理 API 返回 returnCode: 40404
        if (response.returnCode === '40404') {
          return '企业未找到';
        }

        // 5. 处理网络错误
        if (response.returnCode === 'NETWORK_ERROR') {
          return '查询服务暂时不可用，请稍后重试';
        }

        const { isMatch, hasCoreConfig, matchedEnterprises } = response.data;
        logger.log(`[enterprise_relationship] isMatch=${isMatch}, hasCoreConfig=${hasCoreConfig}, matchedEnterprises=${matchedEnterprises?.length ?? 0}`);

        // 6. 未配置核心企业时，返回上传组件标签
        if (!hasCoreConfig) {
          const uploadContext = JSON.stringify({
            enterpriseName: input.enterpriseName,
            direction: input.direction,
            needEnterpriseList: input.needEnterpriseList,
          });
          return `<core-enterprise-upload data='${uploadContext}'></core-enterprise-upload>\n（注意：以上内容包含自定义组件标签，请原样输出，不要替换为go标签或其他标签）`;
        }

        // 7. 有核心企业配置时，根据匹配结果返回文本
        if (isMatch) {
          let resultText = `该企业在核心企业${directionLabel}。`;

          if (
            input.needEnterpriseList &&
            matchedEnterprises &&
            matchedEnterprises.length > 0
          ) {
            const enterpriseListText = matchedEnterprises
              .map(
                (e) =>
                  `- ${e.enterpriseName}（${DIRECTION_LABELS[e.relationshipType]}）`,
              )
              .join('\n');
            resultText += `\n\n匹配的核心企业名单：\n${enterpriseListText}`;
          }

          return resultText;
        } else {
          if (input.needEnterpriseList) {
            return '未查询到匹配的核心企业，建议去授权采集';
          }
          return `该企业不在核心企业${directionLabel}。`;
        }
      } catch (error: any) {
        logger.error(
          `企业上下游关系查询失败: ${error.message}`,
          error.stack,
        );
        return '查询服务暂时不可用，请稍后重试';
      }
    },
  });
}
