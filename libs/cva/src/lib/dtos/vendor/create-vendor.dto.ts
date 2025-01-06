import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  uuid!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsObject()
  vendor!: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  walletAddress!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsOptional()
  @IsObject()
  extras?: object;
}
