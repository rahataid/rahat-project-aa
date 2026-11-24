// create-grievance-params.dto.ts
import { Allow, IsOptional, IsString, IsUUID } from 'class-validator';

export class RemoveGrievanceDto {
  @IsUUID()
  uuid: string;

  @IsOptional()
  user?: any;

  @Allow()
  @IsOptional()
  @IsString()
  appId?: string;
}
