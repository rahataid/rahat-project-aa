import { RequiredAndOptionalKeys } from '..';

interface IVendor {
  uuid: string;
  name: string;
  walletAddress: string;
  phone?: string;
  location?: string;
  extras?: Record<string, any>;
  vendor?: Record<string, any>;
}

export type CreateVendorDto = RequiredAndOptionalKeys<
  IVendor,
  'uuid' | 'name' | 'walletAddress'
>;

// export class CreateVendorDto {
//   @IsString()
//   uuid!: string;

//   @IsString()
//   @IsNotEmpty()
//   name!: string;

//   @IsObject()
//   vendor!: Record<string, any>;

//   @IsString()
//   @IsNotEmpty()
//   walletAddress!: string;

//   @IsString()
//   @IsOptional()
//   phone?: string;

//   @IsString()
//   @IsOptional()
//   location?: string;

//   @IsOptional()
//   @IsObject()
//   extras?: object;
// }
