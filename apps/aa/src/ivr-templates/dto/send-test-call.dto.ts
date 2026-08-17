import { IsString, IsNotEmpty } from 'class-validator';

export class SendTestCallDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  flowUrl: string;
}
