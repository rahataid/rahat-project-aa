import { Module } from '@nestjs/common';
import { IvrTemplatesController } from './ivr-templates.controller';
import { IvrTemplatesService } from './ivr-templates.service';

@Module({
  controllers: [IvrTemplatesController],
  providers: [IvrTemplatesService],
  exports: [IvrTemplatesService],
})
export class IvrTemplatesModule {}
