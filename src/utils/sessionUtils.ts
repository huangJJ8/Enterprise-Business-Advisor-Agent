// 这个文件包含非Server Action的session工具函数

export const SESSION_TIME = 7 * 24 * 60 * 60; // 单位为秒， 设置为7天

export const getSessionName = (sessionId: string | undefined) => {
  const example = 'user:session:';

  if (!sessionId) {
    throw new Error('sessionId 必填');
  }

  if (sessionId.startsWith(example)) {
    return sessionId;
  }

  return `${example}${sessionId}`;
};
