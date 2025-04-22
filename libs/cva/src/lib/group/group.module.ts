import { Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { CvaGroupController } from './group.controller';
import { CvaGroupService } from './group.service';

const PROVIDERS = [CvaGroupService, PrismaService];

@Module({
  imports: [],
  controllers: [CvaGroupController],
  providers: [...PROVIDERS],
})
export class CvaGroupModule {}
