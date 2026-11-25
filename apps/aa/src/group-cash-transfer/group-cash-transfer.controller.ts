import { Controller, UseGuards } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { GroupCashTransferService } from './group-cash-transfer.service';
import { JOBS } from '../constants';
import {
  AssignFundDto,
  CreateGroupCashTransferDto,
  ListGroupCashTransferDto,
  ListGroupCashTransferRecordDto,
  UpdateGroupCashTransferDto,
  UpdateGroupCashTransferRecordDto,
} from './dto/group-cash-transfer.dto';
import { MicroserviceAuthGuard, RequireAbility } from '@rumsan/user';
import { ACTIONS, SUBJECTS } from '../common/ability.constants';

@Controller()
@UseGuards(MicroserviceAuthGuard)
export class GroupCashTransferController {
  constructor(
    private readonly groupCashTransferService: GroupCashTransferService
  ) {}

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.GROUP_CASH_TRANSFER)
  create(@Payload() payload: CreateGroupCashTransferDto) {
    return this.groupCashTransferService.create(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.GROUP_CASH_TRANSFER)
  update(@Payload() payload: UpdateGroupCashTransferDto) {
    return this.groupCashTransferService.update(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.DELETE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.DELETE, SUBJECTS.GROUP_CASH_TRANSFER)
  delete(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.delete(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  get(@Payload() payload: ListGroupCashTransferDto) {
    return this.groupCashTransferService.get(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  getOne(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.getOne(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.ASSIGN_FUND,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.GROUP_CASH_TRANSFER)
  assignFund(@Payload() payload: AssignFundDto) {
    return this.groupCashTransferService.assignFund(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.DISBURSE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.GROUP_CASH_TRANSFER)
  disburse(@Payload() payload: { uuid: string; user: any; otp: string }) {
    return this.groupCashTransferService.disburse(
      payload.uuid,
      payload.user,
      payload.otp
    );
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.SEND_OTP,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.GROUP_CASH_TRANSFER)
  sendOtp(@Payload() payload: { email: string }) {
    return this.groupCashTransferService.sendOtp(payload.email);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.CONFIRM_DISBURSE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.GROUP_CASH_TRANSFER)
  confirmDisburse(
    @Payload() payload: { uuid: string; paymentProviderId: string }
  ) {
    return this.groupCashTransferService.confirmDisburse(
      payload.uuid,
      payload.paymentProviderId
    );
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_TREASURY_INFO,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  getTreasuryInfo() {
    return this.groupCashTransferService.getTreasuryInfo();
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_RECORDS,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  getRecords(@Payload() payload: ListGroupCashTransferRecordDto) {
    return this.groupCashTransferService.getRecords(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_ONE_RECORD,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  getOneRecord(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.getOneRecord(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.VALIDATE_BANK_ACCOUNT,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.GROUP_CASH_TRANSFER)
  validateBankAccount(
    @Payload()
    payload: {
      groupUuid: string;
      bankId: string;
      bankName: string;
      accountName: string;
      accountNumber: string;
    }
  ) {
    return this.groupCashTransferService.validateBankAccount(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_ALL_VALID,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  getAllValidGroupTransfers() {
    return this.groupCashTransferService.getAllValidGroupTransfers();
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.UPDATE_RECORD,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.GROUP_CASH_TRANSFER)
  updateRecord(@Payload() payload: UpdateGroupCashTransferRecordDto) {
    return this.groupCashTransferService.updateRecord(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_GCT_DATA,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.READ, SUBJECTS.GROUP_CASH_TRANSFER)
  getGCTData(@Payload() payload: { startDate: Date; endDate: Date }) {
    return this.groupCashTransferService.getGCTData(payload);
  }
}
