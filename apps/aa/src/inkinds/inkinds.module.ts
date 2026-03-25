import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [PrismaModule, OtpModule],
  controllers: [InkindsController],
  providers: [InkindsService],
  exports: [InkindsService],
})
export class InkindsModule {}
