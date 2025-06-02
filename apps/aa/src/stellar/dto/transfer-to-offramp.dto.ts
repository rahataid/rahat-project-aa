import { ApiProperty } from '@nestjs/swagger';

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
  beneficiaryWalletAddress: string[] | string;
}
