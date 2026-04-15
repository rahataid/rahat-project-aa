import { IsNumber, IsObject, IsOptional, IsUUID, Min } from 'class-validator';
import { UserObject } from './inkind.dto';

export class AssignGroupInkindDto {
  @IsUUID()
  inkindId: string;

  @IsUUID()
  groupId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsObject()
  user: UserObject;
}
