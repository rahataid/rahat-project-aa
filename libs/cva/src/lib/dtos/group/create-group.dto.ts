import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGroupDto {
  constructor(data: CreateGroupDto) {
    this.name = data.name;
  }

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isSystem?: boolean;

  @IsBoolean()
  @IsOptional()
  autoCreated?: boolean;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class GetGroupDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;
}
