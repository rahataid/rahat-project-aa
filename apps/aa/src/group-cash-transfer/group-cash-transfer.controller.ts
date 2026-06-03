import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { GroupCashTransferService } from './group-cash-transfer.service';
import { JOBS } from '../constants';
import {
  AssignFundDto,
  CreateGroupCashTransferDto,
  ListGroupCashTransferDto,
  UpdateGroupCashTransferDto,
} from './dto/group-cash-transfer.dto';

@Controller()
export class GroupCashTransferController {
  constructor(private readonly groupCashTransferService: GroupCashTransferService) {}

  @MessagePattern({ cmd: JOBS.GROUP_CASH_TRANSFER.CREATE })
  create(@Payload() payload: CreateGroupCashTransferDto) {
    return this.groupCashTransferService.create(payload);
  }

  @MessagePattern({ cmd: JOBS.GROUP_CASH_TRANSFER.UPDATE })
  update(@Payload() payload: UpdateGroupCashTransferDto) {
    return this.groupCashTransferService.update(payload);
  }

  @MessagePattern({ cmd: JOBS.GROUP_CASH_TRANSFER.DELETE })
  delete(@Payload() uuid: string) {
    return this.groupCashTransferService.delete(uuid);
  }

  @MessagePattern({ cmd: JOBS.GROUP_CASH_TRANSFER.GET })
  get(@Payload() payload: ListGroupCashTransferDto) {
    return this.groupCashTransferService.get(payload);
  }

  @MessagePattern({ cmd: JOBS.GROUP_CASH_TRANSFER.ASSIGN_FUND })
  assignFund(@Payload() payload: AssignFundDto) {
    return this.groupCashTransferService.assignFund(payload);
  }

  @MessagePattern({ cmd: JOBS.GROUP_CASH_TRANSFER.DISBURSE })
  disburse(@Payload() recordUuid: string) {
    return this.groupCashTransferService.disburse(recordUuid);
  }
}
