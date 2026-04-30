import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { FundService } from './fundallocation.service';
import { FundAllocationController } from './fundallocation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [FundAllocationController],
  providers: [FundService],
})
export class FundallocationModule {}
