import * as colorChalk from 'chalk';

// 强制启用chalk颜色输出，特别是在Docker环境中
process.env.FORCE_COLOR = '3';
process.env.TERM = 'xterm-256color';

// 创建强制启用颜色的chalk实例
const chalk = new colorChalk.Instance({ level: 3 });

export const color = {
  green: chalk.green,
  red: chalk.red,
  yellow: chalk.yellow,
  blue: chalk.blue,
  cyan: chalk.cyan,
  magenta: chalk.magenta,
  gray: chalk.gray,
};
