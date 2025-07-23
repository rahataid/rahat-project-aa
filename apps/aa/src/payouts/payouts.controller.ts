import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { PayoutsService } from './payouts.service';
import { OfframpService } from './offramp.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import { ListPayoutDto } from './dto/list-payout.dto';

@Controller()
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly offrampService: OfframpService
  ) {}

  @MessagePattern({ cmd: JOBS.PAYOUT.CREATE, uuid: process.env.PROJECT_ID })
  create(@Payload() createPayoutDto: CreatePayoutDto) {
    return this.payoutsService.create(createPayoutDto);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.LIST, uuid: process.env.PROJECT_ID })
  findAll(@Payload() payload: ListPayoutDto) {
    return this.payoutsService.findAll(payload);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.GET, uuid: process.env.PROJECT_ID })
  findOne(@Payload() payload: { uuid: string }) {
    return this.payoutsService.findOne(payload.uuid);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.UPDATE, uuid: process.env.PROJECT_ID })
  update(@Payload() updatePayoutDto: UpdatePayoutDto & { uuid: string }) {
    return this.payoutsService.update(updatePayoutDto.uuid, updatePayoutDto);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.GET_PAYMENT_PROVIDERS,
    uuid: process.env.PROJECT_ID,
  })
  getPaymentProviders() {
    return this.offrampService.getPaymentProvider();
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.TRIGGER_PAYOUT,
    uuid: process.env.PROJECT_ID,
  })
  triggerPayout(@Payload() payload: { uuid: string }) {
    return this.payoutsService.triggerPayout(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.TRIGGER_ONE_FAILED_PAYOUT_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  triggerOneFailedPayoutRequest(
    @Payload() payload: { beneficiaryRedeemUuid: string }
  ) {
    return this.payoutsService.triggerOneFailedPayoutRequest(payload);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.TRIGGER_FAILED_PAYOUT_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  triggerFailedPayoutRequest(@Payload() payload: { payoutUUID: string }) {
    return this.payoutsService.triggerFailedPayoutRequest(payload);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.GET_PAYOUT_LOGS,
    uuid: process.env.PROJECT_ID,
  })
  getPayoutLogs(@Payload() payload: GetPayoutLogsDto) {
    return this.payoutsService.getPayoutLogs(payload);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.GET_PAYOUT_LOG,
    uuid: process.env.PROJECT_ID,
  })
  getPayoutLog(@Payload() payload: { uuid: string }) {
    return this.payoutsService.getPayoutLog(payload.uuid);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.GET_STATS, uuid: process.env.PROJECT_ID })
  getPayoutStats() {
    console.log('first');
    return this.payoutsService.getPayoutStats();
  }
}
