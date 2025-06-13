import { PartialType } from '@nestjs/mapped-types';
import { CreatePayoutDto } from './create-payout.dto';

export class UpdatePayoutDto extends PartialType(CreatePayoutDto) {} 