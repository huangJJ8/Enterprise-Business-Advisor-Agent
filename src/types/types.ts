export enum RateLimitKeyEnum {
  SSE = 'SSE', // SSE
}

export enum YzmTypeEnum {
  LOGIN = 'login',
  REGISTER = 'register',
}

/**
 * 企业采集状态枚举
 */
export enum CombineStatusEnum {
  NOT_LOGIN = '1', // 未登录
  COLLECTING = '2', // 采集中
  COMPLETED = '3', // 采集完成
  COMPLETED_ALT = '4', // 采集完成（备用状态）
  FAILED = '5', // 采集失败
}

/**
 * 采集状态映射表
 */
export const COMBINE_STATUS_MAP: Record<CombineStatusEnum, string> = {
  [CombineStatusEnum.NOT_LOGIN]: '未登录',
  [CombineStatusEnum.COLLECTING]: '采集中',
  [CombineStatusEnum.COMPLETED]: '采集完成',
  [CombineStatusEnum.COMPLETED_ALT]: '采集完成',
  [CombineStatusEnum.FAILED]: '采集失败',
};

/**
 * 获取采集状态显示文本
 */
export function getCombineStatusText(status: string): string {
  return COMBINE_STATUS_MAP[status as CombineStatusEnum] || '未知状态';
}
