import type { Request as req, Response as res } from 'express';
import type { PrismaClient, User } from '@prisma/client';
import { IronSession } from 'iron-session';
import { LoggerService } from 'src/modules-global/logger/service';
import { ModuleRef } from '@nestjs/core';

declare global {
  var logger: LoggerService;

  type Env = 'dev' | 'pre' | 'prod';

  type contentType =
    | 'application/x-www-form-urlencoded;charset=UTF-8'
    | 'application/json;charset=UTF-8';

  interface AxiosConfig extends HttpConfig {
    contentType: contentType;
  }

  type AsyncFunc = (...arg: any[]) => Promise<void>;

  type Func = (...arg: any[]) => void;

  // 不用 Request，Response，而是自定义的 MyReq，MyRes
  // 因为回合其他的d.ts文件有冲突，叫这个名字的太多了
  // 所以其他的命名也要注意
  interface MyReq extends req {
    clientIp: string;
    XTransactionID: string;
    session: SessionType;
    isSessionSaved: boolean;
    moduleRef: ModuleRef;
    /** 是否为 APP 客户端请求（通过 X-Client-Type = app 判断） */
    isAppClient: boolean;
    /** APP 客户端的 sessionId（通过 X-Access-Token 解密得到） */
    appSessionId?: string;
  }

  interface MyRes extends res {
    flush?: () => void;
    XTransactionID: string;
    session: SessionType;
  }
  //服务配置
  interface ServerConfig {
    //主机地址,默认localhost
    host: string;
    //程序启动端口,默认3000
    port: number | string;
  }

  //redis配置
  interface RedisConfig {
    //是否启用,默认true
    enable: boolean;
    host: string;
    port: number;
    username: string;
    //是否需要验证，默认是false
    enableAuth: boolean;
    password: string;
    //默认是0
    db: number;
  }

  interface WinstonConfig {
    level: string;
    dirname: string;
    filename: string;
    datePattern: string;
    maxSize: string;
    maxFiles: string;
  }

  interface HttpConfig {
    //主机地址,默认localhost
    baseURL: string;
    //程序启动端口,默认3000
    timeout: number;
  }

  interface EmailConfig {
    //主机地址,默认localhost
    host: string;
    //程序启动端口,默认3000
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  }

  //qdrant配置
  interface QdrantConfig {
    //qdrant服务地址
    host: string;
    port: number;
    https: boolean;
    //API密钥
    apiKey: string;
    timeout: number;
  }

  //密钥配置
  interface KeysConfig {
    NEXT_PUBLIC_PUBLIC_KEY: string;
    PRIVATE_KEY: string;
    AES_KEY: string;
  }

  // oss 配置
  interface OssConfig {
    host: string;
  }

  // minio 配置
  interface MinioOssConfig {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
  }

  // 腾讯云 COS 配置
  interface TengxunCosConfig {
    SecretId: string;
    SecretKey: string;
    Region: string;
    Bucket: string;
  }

  // 备份邮箱
  interface BackupEmailConfig {
    users: string[];
  }

  // MySQL配置
  interface MysqlConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  }

  // 代理配置
  interface ProxyConfig {
    target: string;
    timeout: number;
    retries: number;
    pathRewrite: Record<string, string>;
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  }

  //应用配置
  interface AppConfig {
    //服务配置
    server: ServerConfig;
    email: EmailConfig;
    backupEmail: BackupEmailConfig;
    mysql: MysqlConfig;
    redis: Partial<RedisConfig>;
    http: Partial<HttpConfig>;
    qdrant: Partial<QdrantConfig>;
    keys: KeysConfig;
    oss: OssConfig;
    minioOss: Partial<MinioOssConfig>;
    tengxunCos: Partial<TengxunCosConfig>;
    proxy: ProxyConfig;
  }
}

export {};
