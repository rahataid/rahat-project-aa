import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';

@Module({
  imports: [PrismaModule],
  providers: [VendorsService],
  controllers: [VendorsController],
  exports: [VendorsService],
})
export class VendorsModule {}
