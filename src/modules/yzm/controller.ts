import { Controller, Get, Res, Session, Query, Headers } from '@nestjs/common';
import * as svgCaptcha from 'svg-captcha';

import { YzmService } from './service';
import { CaptchaDto } from './dto';

@Controller('yzm')
export class YzmController {
  constructor(private readonly yzmService: YzmService) {}

  @Get('captcha')
  async getCaptcha(
    @Session() session: SessionData,
    @Res() res: MyRes,
    @Query() query: CaptchaDto,
  ) {
    const {
      width = 100,
      height = 34,
      fontSize = 50,
      type,
      deviceId,
      background = 'transparent',
    } = query;
    const captcha = svgCaptcha.createMathExpr({
      size: 4,
      fontSize,
      width,
      height,
      background,
      noise: 1, // 噪声线数量
      mathMin: 1,
      mathMax: 50,
      mathOperator: '+',
    });

    const code = captcha.text.toLowerCase();

    // 根据是否有 deviceId 来区分 App 和 Web
    if (deviceId) {
      // App 端：存储到 Redis
      await this.yzmService.setAppYzm(deviceId, type, code);
    } else {
      // Web 端：存储到 session
      const oldYzm = session?.yzm || {};
      session.yzm = {
        ...oldYzm,
        [type]: code,
      };
    }

    // 设置响应头
    res.type('svg');
    res.send(captcha.data);
  }
}
