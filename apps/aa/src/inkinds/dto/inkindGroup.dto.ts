import { IsNumber, IsOptional, IsUUID } from 'class-validator';

export class AssignGroupInkindDto {
  @IsUUID()
  inkindId: string;

  @IsUUID()
  groupId: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;
}
