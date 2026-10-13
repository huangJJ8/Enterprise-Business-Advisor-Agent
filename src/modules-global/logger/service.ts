import { Injectable, Inject, LoggerService as LService } from '@nestjs/common';

import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AsyncContextService } from 'src/modules-global/async-context/service';
import { color } from 'src/utils/color';

@Injectable()
export class LoggerService {
  @Inject(WINSTON_MODULE_NEST_PROVIDER)
  private logger!: LService;

  @Inject(AsyncContextService)
  private asyncContext!: AsyncContextService;

  private get getId() {
    return color.yellow(`[${this.asyncContext.getXTransactionID()}]`);
  }

  error(message: string, trace?: string) {
    this.logger.error(`${this.getId} ${message}`, trace, this.getId);
  }

  warn(message: string) {
    this.logger.warn(`${this.getId} ${message}`, this.getId);
  }

  log(message: string) {
    this.logger.log(`${this.getId} ${message}`, this.getId);
  }

  verbose(message: string) {
    this.logger.verbose?.(`${this.getId} ${message}`, this.getId);
  }

  debug(message: string) {
    this.logger.debug?.(`${this.getId} ${message}`, this.getId);
  }
}
