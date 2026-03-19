import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';

@Module({
  imports: [PrismaModule],
  controllers: [InkindsController],
  providers: [InkindsService],
  exports: [InkindsService],
})
export class InkindsModule {}
