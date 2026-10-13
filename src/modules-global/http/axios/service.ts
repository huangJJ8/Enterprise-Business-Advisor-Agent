import { Injectable, Inject, Scope } from '@nestjs/common';
import Axios from 'axios';
import { getJsonLog } from 'src/utils';

import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

import { LoggerService } from 'src/modules-global/logger/service';

@Injectable()
export class AxiosService {
  @Inject(LoggerService)
  private logger!: LoggerService;

  getLogStr = (
    title: string,
    config: InternalAxiosRequestConfig<any>,
    other?: Record<string, any>,
  ) => {
    const { method = '', url = '', params, data } = config;

    const common = getJsonLog({
      [url]: '',
      [method]: '',
      params,
      body: data,
      data: other,
    });

    return getJsonLog({
      [title]: '',
      [common]: '',
    });
  };

  getLogStrRES = (
    title: string,
    config: InternalAxiosRequestConfig<any>,
    other?: Record<string, any>,
  ) => {
    const { method = '', url = '' } = config;

    const common = getJsonLog({
      [url]: '',
      [method]: '',
      data: other,
    });

    return getJsonLog({
      [title]: '',
      [common]: '',
    });
  };

  reqSuccess = (config: InternalAxiosRequestConfig<any>) => {
    this.logger.log(this.getLogStr('[TO:SERVER]', config));
    return config;
  };

  reqError = (error: any) => {
    this.logger.error(`[TO:SERVER] ${JSON.parse(error)}`);
    return Promise.reject(error);
  };

  resSuccess = (res: AxiosResponse<any, any>) => {
    // debugger;
    const status = res.status;
    if ((status >= 200 && status < 300) || status === 304) {
      //   if (res.data.code !== 200) {
      //     this.logger.error(JSON.stringify(res.data));

      //     return Promise.reject(res);
      //   }
      this.logger.log(this.getLogStrRES('[FROM:SERVER]', res.config, res.data));
      return res;
    }

    this.logger.error(this.getLogStrRES('[FROM:SERVER]', res.config, res));

    return Promise.reject(res);
  };

  resError = (error: any) => {
    this.logger.error(this.getLogStr('[FROM:SERVER2]', error.config, error));

    // const status = error.response.status;
    // if (status === 401 || status === 400) {
    //   console.log('token失效');
    // }
    // if (status === 403) {
    //   console.log('您没有权限');
    // }
    return Promise.reject(error.response.data);
  };

  init = (axiosConfig: AxiosConfig) => {
    const { baseURL, timeout, contentType } = axiosConfig;
    const axios = Axios.create({
      //withCredentials: true,
      //crossDomain: true,
      baseURL,
      timeout,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });

    axios.interceptors.request.use(this.reqSuccess, this.reqError);

    // code状态码拦截
    axios.interceptors.response.use(this.resSuccess, this.resError);

    return axios;
  };
}
