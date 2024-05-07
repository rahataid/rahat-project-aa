import { Module } from '@nestjs/common';
import { StakeholdersController } from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';
import { PrismaModule } from '@rumsan/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [StakeholdersController],
  providers: [StakeholdersService],
  exports: [StakeholdersService],
})
export class StakeholdersModule {}
