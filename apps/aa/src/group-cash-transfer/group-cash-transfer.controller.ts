import { Controller } from '@nestjs/common';
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

@Controller()
export class GroupCashTransferController {
  constructor(
    private readonly groupCashTransferService: GroupCashTransferService
  ) {}

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  create(@Payload() payload: CreateGroupCashTransferDto) {
    return this.groupCashTransferService.create(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  update(@Payload() payload: UpdateGroupCashTransferDto) {
    return this.groupCashTransferService.update(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.DELETE,
    uuid: process.env.PROJECT_ID,
  })
  delete(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.delete(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET,
    uuid: process.env.PROJECT_ID,
  })
  get(@Payload() payload: ListGroupCashTransferDto) {
    return this.groupCashTransferService.get(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  getOne(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.getOne(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.ASSIGN_FUND,
    uuid: process.env.PROJECT_ID,
  })
  assignFund(@Payload() payload: AssignFundDto) {
    return this.groupCashTransferService.assignFund(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.DISBURSE,
    uuid: process.env.PROJECT_ID,
  })
  disburse(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.disburse(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_RECORDS,
    uuid: process.env.PROJECT_ID,
  })
  getRecords(@Payload() payload: ListGroupCashTransferRecordDto) {
    return this.groupCashTransferService.getRecords(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_ONE_RECORD,
    uuid: process.env.PROJECT_ID,
  })
  getOneRecord(@Payload() payload: { uuid: string }) {
    return this.groupCashTransferService.getOneRecord(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.VALIDATE_BANK_ACCOUNT,
    uuid: process.env.PROJECT_ID,
  })
  validateBankAccount(@Payload() payload: unknown) {
    return this.groupCashTransferService.validateBankAccount(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_ALL_VALID,
    uuid: process.env.PROJECT_ID,
  })
  getAllValidGroupTransfers() {
    return this.groupCashTransferService.getAllValidGroupTransfers();
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.UPDATE_RECORD,
    uuid: process.env.PROJECT_ID,
  })
  updateRecord(@Payload() payload: UpdateGroupCashTransferRecordDto) {
    return this.groupCashTransferService.updateRecord(payload);
  }

  @MessagePattern({
    cmd: JOBS.GROUP_CASH_TRANSFER.GET_GCT_DATA,
    uuid: process.env.PROJECT_ID,
  })
  getGCTData() {
    return this.groupCashTransferService.getGCTData();
  }
}
