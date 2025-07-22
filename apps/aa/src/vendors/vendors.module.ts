import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { TransactionService, AuthService } from '@rahataid/stellar-sdk-v2';
import { SettingsService } from '@rumsan/settings';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: CORE_MODULE,
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
  ],
  providers: [
    VendorsService,
    {
      provide: TransactionService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        const authService = new AuthService({
          email: settings?.value['EMAIL'],
          password: settings?.value['PASSWORD'],
          tenantName: settings?.value['TENANTNAME'],
          baseUrl: settings?.value['BASEURL'],
        });
        return new TransactionService(
          authService,
          settings?.value['ASSETCREATOR'],
          settings?.value['ASSETCODE'],
          settings?.value['ASSETCREATORSECRET'],
          settings?.value['HORIZONURL'],
          settings?.value['NETWORK']
        );
      },
      inject: [SettingsService],
    },
  ],
  controllers: [VendorsController],
  exports: [VendorsService, TransactionService],
})
export class VendorsModule {}
