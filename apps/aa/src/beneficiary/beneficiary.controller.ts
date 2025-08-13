import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CONTROLLERS, JOBS } from '../constants';
import { BeneficiaryService } from './beneficiary.service';
import {
  AddTokenToGroup,
  CreateBeneficiaryDto,
} from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { UUID } from 'crypto';
import { CVA_JOBS } from '@rahat-project/cva';
import { GetBenfGroupDto, getGroupByUuidDto } from './dto/get-group.dto';

@Controller()
export class BeneficiaryController {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  // @MessagePattern({ cmd: JOBS.BENEFICIARY.LIST, uuid: process.env.PROJECT_ID })
  // findAll(data) {
  //   return this.beneficiaryService.findAll(data);
  // }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.ADD_TO_PROJECT,
    uuid: process.env.PROJECT_ID,
  })
  create(data: CreateBeneficiaryDto) {
    return this.beneficiaryService.create(data);
  }

  @MessagePattern({ cmd: JOBS.BENEFICIARY.GET, uuid: process.env.PROJECT_ID })
  findOne(payload) {
    return this.beneficiaryService.findOne(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_ONE_BENEFICIARY,
    uuid: process.env.PROJECT_ID,
  })
  findOneBeneficiary(payload) {
    return this.beneficiaryService.findOneBeneficiary(payload);
  }
  @MessagePattern({
    cmd: JOBS.BENEFICIARY.LIST_PROJECT_PII,
    uuid: process.env.PROJECT_ID,
  })
  findAllPii(data) {
    return this.beneficiaryService.findAll(data);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.BULK_ASSIGN_TO_PROJECT,
    uuid: process.env.PROJECT_ID,
  })
  createMany(data) {
    return this.beneficiaryService.createMany(data);
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

  // ***** groups start ********** //
  @MessagePattern({
    cmd: JOBS.BENEFICIARY.ADD_GROUP_TO_PROJECT,
    uuid: process.env.PROJECT_ID,
  })
  async addGroupToProject(payload) {
    return this.beneficiaryService.addGroupToProject(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_ALL_GROUPS,
    uuid: process.env.PROJECT_ID,
  })
  async getAllGroups(payload: GetBenfGroupDto) {
    console.log(payload);
    return this.beneficiaryService.getAllGroups(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_ALL_GROUPS_BY_UUIDS,
    uuid: process.env.PROJECT_ID,
  })
  async getAllGroupsByUuids(payload: getGroupByUuidDto) {
    console.log(payload);
    return this.beneficiaryService.getAllGroupsByUuids(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_ONE_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  async getOneGroup(payload: { uuid: UUID }) {
    return this.beneficiaryService.getOneGroup(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_REDEEM_INFO,
    uuid: process.env.PROJECT_ID,
  })
  async getBeneficiaryRedeemInfo(payload: { beneficiaryUUID: string }) {
    return this.beneficiaryService.getBeneficiaryRedeemInfo(
      payload.beneficiaryUUID
    );
  }
  // ***** groups end ********** //

  // ***** groups fund mgmt ********** //
  @MessagePattern({
    cmd: JOBS.BENEFICIARY.RESERVE_TOKEN_TO_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  async reserveTokenToGroup(payload: AddTokenToGroup) {
    return this.beneficiaryService.reserveTokenToGroup(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_ALL_TOKEN_RESERVATION,
    uuid: process.env.PROJECT_ID,
  })
  async getTokenReservations(payload) {
    return this.beneficiaryService.getAllTokenReservations(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_ONE_TOKEN_RESERVATION,
    uuid: process.env.PROJECT_ID,
  })
  async getOneTokenReservations(payload) {
    return this.beneficiaryService.getOneTokenReservation(payload);
  }

  @MessagePattern({
    cmd: JOBS.BENEFICIARY.GET_RESERVATION_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getReservationStats(payload) {
    return this.beneficiaryService.getReservationStats(payload);
  }

  // ***** groups fund mgmt end ********** //
  @MessagePattern({
    cmd: CVA_JOBS.PAYOUT.ASSIGN_TOKEN,
    location: process.env['PROJECT_LOCATION'],
  })
  assignToken() {
    return this.beneficiaryService.assignToken();
  }
}
