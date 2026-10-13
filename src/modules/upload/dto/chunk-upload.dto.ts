import { IsString, IsNotEmpty, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 分片上传 DTO
 */
export class ChunkUploadDto {
  @IsString()
  @IsNotEmpty()
  uploadId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkIndex!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalChunks!: number;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsIn(['template', 'data'])
  fileType!: 'template' | 'data';
}
