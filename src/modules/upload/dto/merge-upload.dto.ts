import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject } from 'class-validator';

/**
 * 合并上传 DTO
 */
export class MergeUploadDto {
  @IsString()
  @IsNotEmpty()
  uploadId!: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  taxNo?: string;

  @IsOptional()
  @IsBoolean()
  hasFiles?: boolean;

  @IsOptional()
  @IsObject()
  userInfo?: {
    orgNo: string;
    orgChannelNo: string;
    id: number;
  };

  @IsOptional()
  @IsString()
  taskType?: 'customReport' | 'enterpriseTag';

  @IsOptional()
  @IsBoolean()
  skipAuth?: boolean;
}
