import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Agent 聊天请求 DTO
 */
export class AgentChatDto {
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsString()
  @IsOptional()
  orgNo?: string;

  @IsString()
  @IsOptional()
  orgChannelNo?: string;

  @Type(() => Number)
  @IsOptional()
  orgChannelUserId?: number;

  @IsString()
  @IsNotEmpty()
  userInfo!: string;

  @IsString()
  @IsNotEmpty()
  contextId!: string;

  @IsString()
  @IsOptional()
  customReportId?: string;
}
