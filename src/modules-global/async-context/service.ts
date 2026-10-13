import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

// 定义上下文数据接口
interface AsyncContext {
  XTransactionID: string;
  request: MyReq;
  response: MyRes;
}

@Injectable()
export class AsyncContextService {

  private readonly asyncLocalStorage = new AsyncLocalStorage<AsyncContext>();

  /**
   * 运行带有上下文的函数
   * @param context 上下文数据
   * @param fn 要执行的函数
   * @returns 函数执行结果
   */
  run<T>(context: AsyncContext, fn: () => T): T {
    return this.asyncLocalStorage.run(context, fn);
  }

  /**
   * 获取当前上下文中的XTransactionID
   * @returns XTransactionID 或 '--'
   */
  getXTransactionID(): string {
    const context = this.asyncLocalStorage.getStore();
    return context?.XTransactionID ?? '--';
  }

  /**
   * 获取当前上下文中的request
   * @returns request 或 undefined
   */
  getRequest() {
    const context = this.asyncLocalStorage.getStore();
    return context?.request;
  }

  /**
   * 获取当前上下文中的response
   * @returns response 或 undefined
   */
  getResponse() {
    const context = this.asyncLocalStorage.getStore();
    return context?.response;
  }

  /**
   * 获取当前上下文中的userId
   * @returns userId 或 undefined
   */
  getUserSession() {
    const context = this.asyncLocalStorage.getStore();
    return context?.request.session;
  }

  /**
   * 获取当前上下文中的用户信息
   * 支持 APP 客户端（通过 X-Access-Token 解密）和 Web 客户端（通过 Cookie/Session）
   * @returns 用户数据
   */
  async getUserInfo() {
    const context = this.asyncLocalStorage.getStore();
    if (!context) {
      throw new Error('AsyncContext 没有值');
    }

    // 使用通用方法获取用户数据，支持 APP 和 Web 客户端
    const userInfo = {}
    return userInfo;
  }

  /**
   * 设置当前上下文中的XTransactionID
   * @param XTransactionID 事务ID
   */
  setXTransactionID(XTransactionID: string): void {
    const context = this.asyncLocalStorage.getStore();
    if (context) {
      context.XTransactionID = XTransactionID;
    }
  }

  /**
   * 获取当前完整上下文
   * @returns 当前上下文或undefined
   */
  getContext(): AsyncContext | undefined {
    return this.asyncLocalStorage.getStore();
  }
}
