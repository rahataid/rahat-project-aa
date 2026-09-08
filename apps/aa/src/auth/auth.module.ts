import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AUTH_SERVICE_CLIENT,
  MicroserviceAuthModule,
} from '@rumsan/user/ability/ms-rpc-auth';

@Global()
@Module({
  imports: [
    MicroserviceAuthModule,
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE_CLIENT,
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
    ]),
  ],
  exports: [MicroserviceAuthModule, ClientsModule],
})
export class AuthModule {}
