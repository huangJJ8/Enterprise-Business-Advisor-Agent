import { v4, v5 } from 'uuid';
import * as chalk from 'chalk';
import { getConfig } from '../config';

// 导出分页工具
export * from './pagination';

export const uuid = () => v4();

export const cuidToUuid = (cuid: string) => {
  const CUID_NAMESPACE = '550e8400-e29b-41d4-a716-446655440000';
  return v5(cuid, CUID_NAMESPACE);
};

// ------------------------------------------------------------------------------------------------------
// APP 客户端请求判断相关函数

// APP 客户端请求头常量
export const APP_CLIENT_HEADER = 'x-client-type';
export const APP_CLIENT_VALUE = 'app';
export const ACCESS_TOKEN_HEADER = 'x-access-token';

/**
 * 判断请求是否来自 APP 客户端
 * 通过检查请求头 X-Client-Type 是否为 'app'
 * @param req 请求对象
 * @returns 是否为 APP 客户端请求
 */
export function isAppClient(req: MyReq): boolean {
  const clientType = req.headers[APP_CLIENT_HEADER];
  return clientType === APP_CLIENT_VALUE;
}

/**
 * 从请求头中获取 Access Token
 * @param req 请求对象
 * @returns Access Token 或 undefined
 */
export function getAccessToken(req: MyReq): string | undefined {
  const token = req.headers[ACCESS_TOKEN_HEADER];
  if (Array.isArray(token)) {
    return token[0];
  }
  return token;
}

// ------------------------------------------------------------------------------------------------------

// 生成随机n位数
export function getRandom(n: number = 6) {
  // 其他方法：Math.random().toString().slice(2, 8);
  // '0.18127426233460886'
  return Math.random().toFixed(n).slice(-n);
}

export const isObj = (value) => typeof value === 'object' && value !== null;

export const getJsonLog = (Json: Record<string, any>) => {
  const list = Object.entries(Json).map(([key, value], index) => {
    const str = value
      ? `${key}: ${isObj(value) ? JSON.stringify(value, (key, val) => (typeof val === 'bigint' ? val.toString() : val)) : value}`
      : key;
    return index === 0 ? chalk.blue(str) : str;
  });

  const str = list.join(' - ');

  return str;
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 创建一个柯里化的once函数，确保传入的函数只执行一次
 * @param {Function} fn - 需要执行的函数
 * @returns {Function} - 返回一个新函数，该函数只会执行一次
 */
export const once = <T extends (...args: any[]) => any>(fn: T): T => {
  let hasExecuted = false;
  let result: ReturnType<T>;

  return ((...args: Parameters<T>) => {
    if (!hasExecuted) {
      hasExecuted = true;
      result = fn(...args);
    }
    return result;
  }) as T;
};

export const handleChunk = <T = any>(arr: T[], size = 10) => {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

export const getOssHostUrl = (url: string) => {
  if (!url) return url;
  const { oss } = getConfig() as AppConfig;
  const base = new URL(url, oss.host);
  return base.toString();
};

export function normalizeDataTypes(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 处理BigInt对象，处理成string类型
  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  // 处理Date对象, 处理成number类型
  if (obj instanceof Date) {
    return obj.getTime();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeDataTypes(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        converted[key] = normalizeDataTypes(obj[key]);
      }
    }
    return converted;
  }

  return obj;
}
