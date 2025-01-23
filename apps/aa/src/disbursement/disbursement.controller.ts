import { Controller, Body } from '@nestjs/common';
import { DisbursementService } from './disbursement.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS, STELLER_UID } from '../constants';

@Controller('disbursement')
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @MessagePattern({ cmd: JOBS.STELLAR.CREATE_DISBURSEMENT, STELLER_UID })
  async create_disbursement(@Body() createDisbursementDto: any) {
    if (createDisbursementDto.file && createDisbursementDto.file.buffer) {
      createDisbursementDto.file.buffer = Buffer.from(
        createDisbursementDto.file.buffer,
        'base64'
      );
    }
    return this.disbursementService.create_disbursement(
      createDisbursementDto.file,
      createDisbursementDto
    );
  }
}
