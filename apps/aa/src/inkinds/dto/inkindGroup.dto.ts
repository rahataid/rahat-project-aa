import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class AssignGroupInkindDto {
  @IsUUID()
  inkindId: string;

  @IsUUID()
  groupId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
