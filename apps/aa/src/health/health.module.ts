// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
import { BullModule } from '@nestjs/bull';
import { Global, Logger, Module } from '@nestjs/common';
import { BQUEUE } from '../constants';
import { PrismaService } from '@rumsan/prisma';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MS_TRIGGER_CLIENTS } from '@rahat-project/cva';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: BQUEUE.COMMUNICATION }),
    ClientsModule.register([
      {
        name: MS_TRIGGER_CLIENTS.RAHAT,
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT
            ? parseInt(process.env.REDIS_PORT)
            : 6379,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [HealthService, PrismaService, Logger],
  exports: [HealthService],
})
export class HealthModule {}
