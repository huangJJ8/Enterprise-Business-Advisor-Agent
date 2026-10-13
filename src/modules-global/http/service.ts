import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AxiosInstance, AxiosHeaders } from 'axios';

import { AxiosService } from './axios/service';

interface commonType {
  url: string;
  headers?: AxiosHeaders;
}
interface getType extends commonType {
  params?: Record<string, any>;
}

interface postType extends commonType {
  data?: Record<string, any>;
}

@Injectable()
export class HttpService {
  private json!: AxiosInstance;

  private xform!: AxiosInstance;

  // @Inject(AxiosService)
  // private axiosService!: AxiosService;

  constructor(
    private configService: ConfigService,
    @Inject(AxiosService) private axiosService: AxiosService,
  ) {
    /**
     * 每次新的请求都会调用一次构造函数，所以这里的配置信息会被重新读取。
     * 原因是 @Injectable({ scope: Scope.REQUEST })，这种情况下，每次请求都会创建新的实例，
     * 构造函数会在每次请求时执行。但用户的问题描述中，构造函数只在调用时执行，这可能意味着服
     * 务的作用域被设置为了请求作用域，导致延迟初始化。
     * 不过影响性能不大，可以忽略
     */
    const config = this.configService.get('http') as HttpConfig;

    const { baseURL, timeout } = config;

    this.json = this.axiosService.init({
      baseURL,
      timeout,
      contentType: 'application/json;charset=UTF-8',
    });

    // const xform = this.axiosService.init({
    //   baseURL,
    //   timeout,
    //   contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    // });
  }

  async get({ url, params = {}, headers }: getType) {
    return this.json({
      method: 'GET',
      url,
      params,
      headers,
    });
  }
  async post({ url, data = {}, headers }: postType) {
    return this.json({
      method: 'POST',
      url,
      data,
      headers,
    });
  }
}
