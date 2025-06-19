import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator';

export class TransferToOfframpDto {
  
  @ApiProperty({
    description: 'Wallet Address of offramp',
    example: 'GC...',
  })
  offRampWalletAddress: string;

  @ApiProperty({
    description: 'Wallet Address of beneficiaries',
    example: ['GC...', 'GB...'],
  })
  beneficiaryWalletAddress: string;
}
