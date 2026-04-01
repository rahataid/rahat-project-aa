import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { InkindsService } from './inkinds.service';
import {
  CreateInkindDto,
  UpdateInkindDto,
  GetInkindDto,
  DeleteInkindDto,
  ListInkindDto,
  BeneficiaryInkindRedeemDto,
  GetGroupInkindLogsDto,
  GetVendorInkindLogsDto,
} from './dto/inkind.dto';
import { AddInkindStockDto, ListStockMovementsDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';

@Controller()
export class InkindsController {
  constructor(private readonly inkindsService: InkindsService) {}

  @MessagePattern({
    cmd: JOBS.INKINDS.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  create(@Payload() createInkindDto: CreateInkindDto) {
    return this.inkindsService.create(createInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  update(@Payload() updateInkindDto: UpdateInkindDto) {
    return this.inkindsService.update(updateInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.DELETE,
    uuid: process.env.PROJECT_ID,
  })
  delete(@Payload() deleteInkindDto: DeleteInkindDto) {
    return this.inkindsService.delete(deleteInkindDto.uuid);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET,
    uuid: process.env.PROJECT_ID,
  })
  get(@Payload() listInkindDto: ListInkindDto) {
    return this.inkindsService.get(listInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_SUMMARY,
    uuid: process.env.PROJECT_ID,
  })
  getInkindSummary() {
    return this.inkindsService.getInkindSummary();
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  getOne(@Payload() getInkindDto: GetInkindDto) {
    return this.inkindsService.getOne(getInkindDto.uuid);
  }

  // Inkinds stock management
  @MessagePattern({
    cmd: JOBS.INKINDS.ADD_INKIND_STOCK,
    uuid: process.env.PROJECT_ID,
  })
  addInkindStock(@Payload() addInkindStockDto: AddInkindStockDto) {
    return this.inkindsService.addInkindStock(addInkindStockDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_ALL_STOCK_MOVEMENTS,
    uuid: process.env.PROJECT_ID,
  })
  getAllStockMovements(@Payload() payload: ListStockMovementsDto) {
    return this.inkindsService.getAllStockMovements(payload);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.REMOVE_INKIND_STOCK,
    uuid: process.env.PROJECT_ID,
  })
  removeInkindStock(@Payload() removeInkindStockDto: RemoveInkindStockDto) {
    return this.inkindsService.removeInkindStock(removeInkindStockDto);
  }

  // Group inkinds management
  @MessagePattern({
    cmd: JOBS.INKINDS.ASSIGN_GROUP_INKIND,
    uuid: process.env.PROJECT_ID,
  })
  assignGroupInkind(@Payload() assignGroupInkindDto: AssignGroupInkindDto) {
    return this.inkindsService.assignGroupInkind(assignGroupInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_BY_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  getByGroup() {
    return this.inkindsService.getByGroup();
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_UNASSIGNED_GROUP_INKIND,
    uuid: process.env.PROJECT_ID,
  })
  getUnassignedGroupInkind(@Payload() payload: { uuid: string }) {
    return this.inkindsService.getUnassignedInkindGroups(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_AVAILABLE_INKIND_BENEFICIARY_PHONE,
    uuid: process.env.PROJECT_ID,
  })
  getAvailableInkindByBeneficiary(@Payload() Payload: { number: string }) {
    return this.inkindsService.getAvailableInkindByBeneficiary(Payload.number);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.SEND_BENEFICIARY_OTP,
    uuid: process.env.PROJECT_ID,
  })
  sendBeneficiaryOtp(@Payload() Payload: { number: string }) {
    return this.inkindsService.sendBeneficiaryOtp(Payload.number);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.VALIDATE_BENEFICIARY_OTP,
    uuid: process.env.PROJECT_ID,
  })
  validateBeneficiaryOtp(@Payload() Payload: { number: string; otp: string }) {
    return this.inkindsService.validateBeneficiaryOtp(
      Payload.number,
      Payload.otp
    );
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.BENEFICIARY_INKIND_REDEEM,
    uuid: process.env.PROJECT_ID,
  })
  beneficiaryInkindRedeem(
    @Payload() redeemInkindByBeneficiaryDto: BeneficiaryInkindRedeemDto
  ) {
    return this.inkindsService.beneficiaryInkindRedeem(
      redeemInkindByBeneficiaryDto
    );
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_GROUP_INKIND_LOGS,
    uuid: process.env.PROJECT_ID,
  })
  getLogsByGroupInkind(@Payload() payload: GetGroupInkindLogsDto) {
    return this.inkindsService.getLogsByGroupInkind(payload);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_GROUP_INKIND_LOGS_BY_VENDOR,
    uuid: process.env.PROJECT_ID,
  })
  getLogsByGroupInkindForVendor(@Payload() payload: GetVendorInkindLogsDto) {
    return this.inkindsService.getLogsByGroupInkindForVendor(payload);
  }
}
