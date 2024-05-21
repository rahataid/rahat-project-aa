import { Controller } from '@nestjs/common';
import { ContractService } from './contract.service';
import { JOBS } from '../constants';
import { MessagePattern } from '@nestjs/microservices';

@Controller('contract')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @MessagePattern({
        cmd: JOBS.HAZARD_TYPES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async increaseBudget(data) {
      console.log(data)
        return "True"
    }

}
