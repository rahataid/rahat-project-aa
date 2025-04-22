import { MessagePattern } from '@nestjs/microservices';
import { CvaDisbursementService } from './disbursement.service';
import { CVA_JOBS } from '../constants';
import { CreateDisbursementDto, GetDisbursementDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { Controller } from '@nestjs/common';

@Controller()
export class CvaDisbursementController {
  constructor(private readonly disbService: CvaDisbursementService) {}

  // @MessagePattern({
  //   cmd: CVA_JOBS.DISBURSEMENT.CREATE,
  //   uuid: process.env['PROJECT_ID'],
  // })
  // create(dto: CreateDisbursementDto) {
  //   return this.disbService.create(dto);
  // }

  @MessagePattern({
    cmd: CVA_JOBS.DISBURSEMENT.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(query: PaginationBaseDto): any {
    return this.disbService.list(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(dto: GetDisbursementDto) {
    return this.disbService.findOne(dto);
  }
}
