import { IsUUID } from 'class-validator';

export class GroupUuidDto {
  @IsUUID()
  groupUuid: string;
}
