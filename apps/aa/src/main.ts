import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
      AppModule,
      {
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT),
          password: process.env.REDIS_PASSWORD,
        },
      }
    );
    await app.init();
  } catch (err) {
    console.log(err);
  }
  Logger.log(`🚀 Anticipatory action MS is running!`);
}
bootstrap();
