import { IsString } from 'class-validator';

export * from './create-vendor.dto';

export class GetVendorDto {
  @IsString()
  uuid!: string;
}
