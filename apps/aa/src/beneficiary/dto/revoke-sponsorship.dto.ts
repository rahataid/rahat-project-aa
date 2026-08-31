import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeSponsorshipForGroupDto {
  @IsString()
  @IsNotEmpty()
  groupUuid: string;
}
