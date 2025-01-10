import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { CvaVendorService } from './vendor.service';
import { CvaVendorController } from './vendor.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: ProjectContants.ELClient,
        transport: Transport.REDIS,
        options: {
          host: process.env['REDIS_HOST'] || 'localhost',
          port: parseInt(process.env['REDIS_PORT'] || '6666'),
          password: process.env['REDIS_PASSWORD'] || 'rahat123',
        },
      },
    ]),
  ],
  controllers: [CvaVendorController],
  providers: [CvaVendorService],
})
export class CvaVendorModule {}
