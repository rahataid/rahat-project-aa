import { Controller, Body, Inject, forwardRef } from '@nestjs/common';
import { DisbursementService } from './disbursement.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS, STELLER_UID } from '../constants';

export class DisbursementController {
  constructor(
    @Inject(forwardRef(() => DisbursementService))
    private dbService: DisbursementService
  ) {}

  @MessagePattern({
    cmd: 'rahat.jobs.disbursement.create',
    uuid: process.env.PROJECT_ID,
  })
  async create_disbursement(@Body() dto: any) {
    if (dto.file && dto.file.buffer) {
      dto.file.buffer = Buffer.from(dto.file.buffer, 'base64');
    }
    return this.dbService.createDisbursement(dto.file, dto);
  }
}
