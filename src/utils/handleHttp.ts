import * as rawBody from 'raw-body';
import contentType from 'content-type'; // 辅助解析 Content-Type 的工具包（需安装）
import { IncomingMessage } from 'http';

// 解析请求的 Content-Type 头
export function getCharset(req: IncomingMessage) {
  try {
    // 用 content-type 包解析头信息
    const { parameters } = contentType.parse(req);
    // 返回 charset，默认 utf-8
    return parameters.charset || 'utf-8';
  } catch (err) {
    // 解析失败时默认用 utf-8
    return 'utf-8';
  }
}

// 使用示例
export async function handleRequest(req: IncomingMessage) {
  // 获取编码
  const charset = getCharset(req);

  // 用获取到的编码解析请求体
  const str = await rawBody(req, { encoding: charset });

  return str;
}

export async function formatBody(req: IncomingMessage) {
  // 处理POST请求体 - 直接从原始请求流中读取
  let bodyStr = 'null';

  try {
    bodyStr = await handleRequest(req);
    bodyStr = JSON.stringify(JSON.parse(bodyStr));
  } catch (error) {
    // 工具函数中无法注入 LoggerService，使用 global.logger
    global.logger?.log('formatBody-error ' + error);
  }

  return {
    bodyStr,
  };
}
