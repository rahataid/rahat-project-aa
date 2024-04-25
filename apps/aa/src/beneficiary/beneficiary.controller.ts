import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CONTROLLERS, JOBS } from '../constants';
import { BeneficiaryService } from './beneficiary.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Controller()
export class BeneficiaryController {
  constructor(
    private readonly beneficiaryService: BeneficiaryService
  ) { }


  @MessagePattern({ cmd: JOBS.BENEFICIARY.LIST, uuid: process.env.PROJECT_ID, })
  findAll(data) {
    return this.beneficiaryService.findAll(data);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.ADD_TO_PROJECT,
    uuid: process.env.PROJECT_ID,
  })
  create(data: CreateBeneficiaryDto) {
    return this.beneficiaryService.create(data);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.BULK_ASSIGN_TO_PROJECT,
    uuid: process.env.PROJECT_ID,
  })
  createMany(data) {
    return this.beneficiaryService.createMany(data);
  }


  @MessagePattern({ cmd: JOBS.BENEFICIARY.GET, uuid: process.env.PROJECT_ID })
  findOne(payload) {
    return this.beneficiaryService.findOne(payload);
  }

  @MessagePattern({ cmd: JOBS.BENEFICIARY.REMOVE })
  async remove(payload: any) {
    return this.beneficiaryService.remove(payload);
  }

  @MessagePattern({ cmd: CONTROLLERS.BENEFICIARY.UPDATE })
  update(@Payload() updateBeneficiaryDto: UpdateBeneficiaryDto) {
    return this.beneficiaryService.update(
      updateBeneficiaryDto.id,
      updateBeneficiaryDto
    );
  }

}
