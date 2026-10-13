import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'page必须是数字' })
  @Min(1, { message: 'page最小为1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'pageSize必须是数字' })
  @Min(1, { message: 'pageSize最小为1' })
  @Max(100, { message: 'pageSize最大为100' })
  pageSize?: number = 10;
}
