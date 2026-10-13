import { env, cwd } from 'process';
import * as fs from 'fs';
import { parse } from 'yaml';
import * as path from 'path';

export const getEnv = () =>
  ((env as Record<string, any>).PRODUCT_ENV as Env) ?? 'prd';

export const isDev = getEnv() === 'dev';

export function getConfig(): AppConfig {
  const env = getEnv();
  // 启动阶段 global.logger 可能尚未初始化，使用可选调用
  global.logger?.log('env ' + env);
  const yamlPath = path.join(cwd(), `./config.${env}.yaml`);
  const file = fs.readFileSync(yamlPath, 'utf-8');
  const config = parse(file);

  return config;
}
