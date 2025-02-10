import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCommunicationDto {
  constructor(data: CreateCommunicationDto) {
    this.name = data.name;
    this.message = data.message;
    this.transportId = data.transportId;
  }

  @IsString()
  name: string;

  @IsString()
  message: string;

  @IsString()
  transportId: string;

  @IsString()
  @IsOptional()
  groupUID?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class GetCommunicationDto {
  @IsNotEmpty()
  @IsString()
  uuid!: string;
}

export class TriggerCommunicationDto {
  @IsString()
  communicationId!: string;
}
