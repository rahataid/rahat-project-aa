import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsIn,
} from 'class-validator';

export class MintTokenRequestDto {
  @IsNumberString()
  @IsNotEmpty()
  amount: string; // Amount to mint (in wei/smallest unit)

  @IsOptional()
  @IsString()
  description?: string; // Optional description for the mint operation

  @IsOptional()
  @IsIn(['evm', 'stellar'])
  chainType?: 'evm' | 'stellar'; // Optional chain type, defaults to EVM
}

export class MintTokenResponseDto {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  amount: string;
  tokenAddress: string;
  projectAddress: string;
  description?: string;
  error?: string;
}
