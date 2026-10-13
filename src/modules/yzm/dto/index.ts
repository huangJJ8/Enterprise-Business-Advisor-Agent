import {
  IsNotEmpty,
  MinLength,
  IsString,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

import { YzmTypeEnum } from 'src/types/types';

export class CaptchaDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  fontSize?: number;

  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  type!: YzmTypeEnum;

  @IsOptional()
  @IsString()
  @Type(() => String)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  background?: string;
}
