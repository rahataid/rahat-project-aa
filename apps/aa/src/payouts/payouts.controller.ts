import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';

@Controller()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @MessagePattern({ cmd: JOBS.PAYOUT.CREATE, uuid: process.env.PROJECT_ID })
  create(@Payload() createPayoutDto: CreatePayoutDto) {
    return this.payoutsService.create(createPayoutDto);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.LIST, uuid: process.env.PROJECT_ID })
  findAll() {
    return this.payoutsService.findAll();
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.GET, uuid: process.env.PROJECT_ID })
  findOne(@Payload() payload: { uuid: string }) {
    return this.payoutsService.findOne(payload.uuid);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.UPDATE, uuid: process.env.PROJECT_ID })
  update(@Payload() updatePayoutDto: UpdatePayoutDto & { uuid: string }) {
    return this.payoutsService.update(updatePayoutDto.uuid, updatePayoutDto);
  }
} 