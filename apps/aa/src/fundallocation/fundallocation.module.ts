import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { FundService } from './fundallocation.service';
import { FundAllocationController } from './fundallocation.controller';
import { MicroserviceAuthModule } from '@rumsan/user/ability/ms-rpc-auth';

@Module({
  imports: [PrismaModule, MicroserviceAuthModule],
  controllers: [FundAllocationController],
  providers: [FundService],
})
export class FundallocationModule {}
