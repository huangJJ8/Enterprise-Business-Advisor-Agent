import type { Request as req, Response as res } from 'express';
import { IronSession } from 'iron-session';

import { YzmTypeEnum } from './types';

declare global {
  interface SessionData {
    yzm?: Partial<Record<YzmTypeEnum, string>>;
    user?: UserSessionData;
    showPassword?: string;
    loginEmailCaptchaCode?: string;
  }

  type SessionType = IronSession<SessionData>;

  interface UserSessionData {
    sessionId?: string;
  }

  interface OpenAIConfig {
    key: string;
    url: string;
  }

  // 0: 客户端断开连接
  // 1: 连接超时，自动关闭
  // 2: 检测到僵尸连接，自动关闭
  interface SseOptions {
    dev?: boolean; // 开发模式开关，为true时不启用心跳检测
    close?: ({
      type,
      message,
    }: {
      type: 0 | 1 | 2;
      message: string;
    }) => Promise<void>;
  }

  // 装饰器
  interface RateLimitDecoratorPayload {
    count: number;
    second: number;
    key?: string;
  }

  interface UploadReturnType {
    ossUrl: string;
    media: MediaReturnType | null | undefined; // 分片上传时，media为null
  }
}

export {};
