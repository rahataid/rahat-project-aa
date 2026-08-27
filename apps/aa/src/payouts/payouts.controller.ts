import { Controller, UseGuards } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { PayoutsService } from './payouts.service';
import { OfframpService } from './offramp.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import { ListPayoutDto } from './dto/list-payout.dto';
import { MicroserviceAuthGuard, RequireAbility } from '@rumsan/user';
import { ACTIONS, SUBJECTS } from '../common/ability.constants';

@Controller()
@UseGuards(MicroserviceAuthGuard)
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly offrampService: OfframpService
  ) {}

  @MessagePattern({ cmd: JOBS.PAYOUT.CREATE, uuid: process.env.PROJECT_ID })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.PAYOUT)
  create(@Payload() createPayoutDto: CreatePayoutDto) {
    return this.payoutsService.create(createPayoutDto);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.LIST, uuid: process.env.PROJECT_ID })
  findAll(@Payload() payload: ListPayoutDto) {
    return this.payoutsService.findAll(payload);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.GET, uuid: process.env.PROJECT_ID })
  findOne(@Payload() payload: { uuid: string }) {
    return this.payoutsService.getOne(payload.uuid);
  }

  @MessagePattern({ cmd: JOBS.PAYOUT.UPDATE, uuid: process.env.PROJECT_ID })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.PAYOUT)
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
    cmd: JOBS.PAYOUT.SEND_OTP,
    uuid: process.env.PROJECT_ID,
  })
  sendOtp(@Payload() payload: { email: string }) {
    return this.payoutsService.sendOtp(payload.email);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.TRIGGER_PAYOUT,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.TRIGGER, SUBJECTS.PAYOUT)
  triggerPayout(@Payload() payload: { uuid: string; user?: any; otp: string }) {
    return this.payoutsService.triggerPayout(
      payload.uuid,
      payload.user,
      payload.otp
    );
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.TRIGGER_ONE_FAILED_PAYOUT_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.TRIGGER, SUBJECTS.PAYOUT)
  triggerOneFailedPayoutRequest(
    @Payload() payload: { beneficiaryRedeemUuid: string }
  ) {
    return this.payoutsService.triggerOneFailedPayoutRequest(payload);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.TRIGGER_FAILED_PAYOUT_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.TRIGGER, SUBJECTS.PAYOUT)
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
  getPayoutStats(@Payload() payload: { startDate?: string; endDate?: string }) {
    return this.payoutsService.getPayoutStats(payload);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.EXPORT_PAYOUT_LOGS,
    uuid: process.env.PROJECT_ID,
  })
  downloadPayoutLogs(@Payload() payload: { payoutUUID: string }) {
    return this.payoutsService.downloadPayoutLogs(payload.payoutUUID);
  }

  @MessagePattern({
    cmd: JOBS.PAYOUT.VERIFY_MANUAL_PAYOUT,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.PAYOUT)
  verifyManualPayout(@Payload() payload: any) {
    return this.payoutsService.verifyManualPayout(
      payload.payoutUUID,
      payload?.data,
      payload?.matchBy
    );
  }
}
