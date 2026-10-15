import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { CvaGroupController } from './group.controller';
import { CvaGroupService } from './group.service';

const PROVIDERS = [CvaGroupService];

@Module({
  imports: [PrismaModule],
  controllers: [CvaGroupController],
  providers: [...PROVIDERS],
})
export class CvaGroupModule {}
