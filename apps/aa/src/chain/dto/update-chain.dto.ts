import { PartialType } from '@nestjs/swagger';
import { CreateChainDto } from './create-chain.dto';

export class UpdateChainDto extends PartialType(CreateChainDto) {}
