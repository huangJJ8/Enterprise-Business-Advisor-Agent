import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Stream } from 'openai/streaming';

import { LoggerService } from 'src/modules-global/logger/service';


// 定义 streams 数组的类型
type StreamItem = {
  title: string;
  type: number;
  stream: Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> | null;
};

@Injectable()
export class AIService {
  private openai!: OpenAI;
  // deepseek-reasoner deepseek-chat Doubao-pro-32k
  aiDefaultName: string = 'Doubao-1.5-pro-32k'; // gpt-3.5-turbo
  aiModelList = [
    {
      modelName: 'DeepSeek-R1',
      model: 'deepseek-reasoner',
      url: 'https://api.deepseek.com/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'DeepSeek-V3',
      model: 'deepseek-chat',
      url: 'https://api.deepseek.com/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    // 这个模型贵好用，非必要不使用
    {
      modelName: 'qwen-max-latest',
      model: 'qwen-max-latest',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'Doubao-1.5-pro-32k',
      model: 'Doubao-1.5-pro-32k',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'Doubao-pro-32k',
      model: 'Doubao-pro-32k',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'text-embedding',
      model: 'text-embedding-ada-002',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'gpt-3.5-turbo',
      model: 'gpt-3.5-turbo',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'gpt-3.5-turbo-16k',
      model: 'gpt-3.5-turbo-16k',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'Doubao-vision-pro-32k',
      model: 'Doubao-vision-pro-32k',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    {
      modelName: 'qwen3-32b',
      model: 'qwen3-32b',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    //qwen2.5-72b-instruct
    {
      modelName: 'qwen2.5-72b-instruct',
      model: 'qwen2.5-72b-instruct',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    // qwen3-235b-a22b
    {
      modelName: 'qwen3-235b-a22b',
      model: 'qwen3-235b-a22b',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
    // qvq-max
    {
      modelName: 'qwen-max',
      model: 'qwen-max',
      url: 'https://api.302.ai/v1',
      key: 'sk-REPLACE_WITH_YOUR_API_KEY',
    },
  ];

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    const openaiConfig = this.configService.get<OpenAIConfig>(
      'openai',
    ) as OpenAIConfig;

    this.logger.debug(`openaiConfig: ${JSON.stringify(openaiConfig)}`);
  }

  /**
   * 设置OpenAI配置
   * @param modelName 模型名称
   * @returns 返回OpenAI配置
   * @throws BadRequestException 当模型不存在时抛出异常
   */
  private async createOpenai(modelName: string) {
    const openaiConfig = this.aiModelList.find(
      (item) => item.modelName === modelName,
    );

    if (!openaiConfig) {
      throw new BadRequestException('模型不存在');
    }

    const { key, url, model } = openaiConfig;

    const openai = new OpenAI({
      apiKey: key,
      baseURL: url,
    });

    return { openaiConfig, openai };
  }

  /**
   * 创建流式完成请求
   * @param params 参数对象
   * @param params.messages 聊天消息数组
   * @param params.model 模型名称，默认为'Doubao-pro-32k'
   * @returns 返回的流对象
   * @example
   * // 创建一个简单的聊天流
   * const stream = await aiService.streamCompletion({
   *   messages: [{ role: 'user', content: '你好' }],
   *   model: 'Doubao-pro-32k'
   * });
   */
  async streamCompletion(params: {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    model?: string;
  }) {
    const { messages, model } = params;

    this.logger.log(`chat stream params: ${JSON.stringify(params)}`);

    // @ts-ignore
    const stream = await this.openai.chat.completions.create({
      model: model || this.aiDefaultName, // 模型名称
      messages, // 消息数组
      hide_thoughts: true, // 隐藏思考过程
      stream: true, // 流式输出
    });

    return stream;
  }

  /**
   * 创建笔记助手的流式聊天
   * @param params 参数对象
   * @param params.prompt 用户输入的提示文本
   * @param params.aiChatHistoryId 可选的上下文ID，用于获取历史消息
   * @param params.systemPrompt 可选的系统提示，默认为'你是little笔记小助理，谈天说地，无所不能'
   * @param params.agentType 可选的模型类型，默认为'0' 0: 全站笔记，1: 我的笔记
   * @returns 返回的流对象
   */
  async littleNoteStream(params: { prompt: string }) {
    const { prompt } = params;

    const systemPromptArr: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        {
          role: 'system' as const,
          content: '我是业务参谋，你的二大爷',
        },
      ];

    const { openai } = await this.createOpenai(this.aiDefaultName);

    this.openai = openai;

    const streams: StreamItem[] = [];

    this.logger.log('getMessageHistory start');

    const stream = this.streamCompletion({
      messages: [
        ...systemPromptArr,
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // 将流添加到 streams 数组中
    streams.push({
      title: 'main',
      type: 0,
      stream,
    });

    // 创建 AbortController 用于控制生成器
    const abortController = new AbortController();
    const logger = this.logger; // 保存 logger 引用，避免在生成器内部使用 this

    async function* chunksGenerator() {
      // 检查是否已被中止
      if (abortController.signal.aborted) {
        return;
      }

      for (const item of streams) {
        const { title, stream } = item;

        if (!stream) {
          continue;
        }

        try {
          for await (const chunk of await stream) {
            // 当 stream.controller.abort() 被调用时
            // OpenAI 的流可能会抛出 AbortError
            // 或者其他网络相关的错误，所以这个错误时该忽略的
            if (abortController.signal.aborted) {
              break;
            }
            yield chunk.choices[0]?.delta as any;
          }
        } catch (error: any) {
          // 详细记录错误信息，帮助调试
          logger.log(
            `生成器捕获到错误: ${error?.name}, 消息: ${error?.message}`,
          );
          logger.log(`中止信号状态: ${abortController.signal.aborted}`);

          // 如果是因为 abort 导致的错误，静默处理
          // 第一个检查 (error?.name === 'AbortError'): 捕获标准的中止错误
          // 第二个检查 (abortController.signal.aborted): 防止某些实现不抛出标准 AbortError 的情况
          if (error?.name === 'AbortError' || abortController.signal.aborted) {
            logger.log('检测到中止操作，静默退出生成器');
            return;
          }

          // 重新抛出真正的错误
          logger.error('生成器遇到真正的错误，重新抛出:', error);
          throw error;
        }
      }
    }

    const chunksStop = async () => {
      // 先中止生成器
      abortController.abort();

      streams.forEach(async (stream) => {
        (await stream.stream)?.controller?.abort?.();
      });
    };

    return {
      chunks: chunksGenerator(),
      chunksStop,
    };
  }
}
