import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ArrayNotEmpty,
  IsObject,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LittleNoteChatDto {
  @IsString()
  @IsNotEmpty({ message: 'prompt不能为空' })
  prompt!: string;
}

