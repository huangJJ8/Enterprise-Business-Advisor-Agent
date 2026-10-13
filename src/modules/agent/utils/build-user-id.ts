/**
 * 将 orgChannelUserId 转换为构造的 userId
 * 规则：orgChannelUserId 转数字 + 999991，结果转字符串
 */
export function buildUserId(orgChannelUserId: number | string): string {
  return String(Number(orgChannelUserId) + 999991);
}
