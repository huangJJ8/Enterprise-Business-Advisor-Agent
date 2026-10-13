import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

// 添加心跳请求DTO
export class HeartbeatDto {
  @IsString()
  @IsNotEmpty({ message: 'requestId不能为空' })
  requestId!: string;
}
