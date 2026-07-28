import { DynamicModule, Global, Module } from '@nestjs/common';
import { CommsService } from './comms.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({})
export class CommsModule {
  static forRoot(): DynamicModule {
    const coreClientModule = ClientsModule.registerAsync([
      {
        name: 'CORE_CLIENT',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.REDIS,
          options: {
            host: configService.get('REDIS_HOST'),
            port: configService.get('REDIS_PORT'),
            password: configService.get('REDIS_PASSWORD'),
          },
        }),
        inject: [ConfigService],
      },
    ]);

    return {
      module: CommsModule,
      global: true,
      imports: [coreClientModule],
      providers: [
        CommsService,
        {
          provide: 'COMMS_CLIENT',
          useFactory: async (commsService: CommsService) => {
            await commsService.init();
            return commsService.getClient();
          },
          inject: [CommsService],
        },
      ],
      exports: [coreClientModule, 'COMMS_CLIENT', CommsService],
    };
  }
}
