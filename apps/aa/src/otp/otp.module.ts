import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

@Module({
  imports: [PrismaModule],
  controllers: [OtpController],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
