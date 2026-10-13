/**
 * 作用: 添加权限
 * 原理: 使用位运算的 | (或运算)，将指定权限位设置为1
 * @param data 用户权限
 * @param flags 权限数组
 * @returns 新的用户权限
 */
export const addState = (data: number, flags: number | number[]) => {
  if (typeof flags === 'number') flags = [flags];
  for (const flag of flags) {
    data = data | flag;
  }
  return data;
};

/**
 * 作用: 删除权限
 * 原理: 使用位运算的 & (与运算)，将指定权限位设置为0
 * @param data 用户权限
 * @param flags 权限数组
 * @returns 新的用户权限
 */
export const delState = (data: number, flags: number | number[]) => {
  if (typeof flags === 'number') flags = [flags];
  for (const flag of flags) {
    data = data & ~flag;
  }
  return data;
};

/**
 * 作用: 检查用户是否拥有指定的权限
 * 原理: 使用位运算的 & (与运算)，检查对应权限位是否为1
 * @param data 用户权限
 * @param flags 权限数组
 * @returns 是否拥有权限
 */
export const checkState = (data: number, flags: number | number[]) => {
  if (typeof flags === 'number') flags = [flags];
  for (const flag of flags) {
    if (!(data & flag)) return false;
  }
  return true;
};
