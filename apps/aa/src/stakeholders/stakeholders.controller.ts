import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { StakeholdersService } from './stakeholders.service';
import {
  AddStakeholdersData,
  AddStakeholdersGroups,
  BulkAddStakeholdersPayload,
  GetAllGroups,
  getGroupByUuidDto,
  GetOneGroup,
  GetStakeholdersData,
  RemoveStakeholdersData,
  RemoveStakeholdersGroup,
  UpdateStakeholdersData,
  UpdateStakeholdersGroups,
} from './dto';

@Controller()
export class StakeholdersController {
  constructor(private readonly stakeholdersService: StakeholdersService) {}

  // ***** stakeholders start ********** //
  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async add(payload: AddStakeholdersData) {
    return this.stakeholdersService.add(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.VALIDATE_BULK_STAKEHOLDERS,
    uuid: process.env.PROJECT_ID,
  })
  async validateBulkStakeholders(payload: any) {
    const normalizedData = Array.isArray(payload)
      ? payload
      : Object.values(payload);
    return this.stakeholdersService.validateBulkStakeholders(normalizedData);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.BULK_ADD,
    uuid: process.env.PROJECT_ID,
  })
  async bulkAdd(payloads: BulkAddStakeholdersPayload) {
    const normalizedData = Array.isArray(payloads?.data)
      ? payloads.data
      : Object.values(payloads.data);
    return this.stakeholdersService.bulkAdd({
      data: normalizedData,
      isGroupCreate: payloads?.isGroupCreate,
      groupName: payloads?.groupName,
    });
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.GET_ALL,
    uuid: process.env.PROJECT_ID,
  })
  async getAll(payload: GetStakeholdersData) {
    return this.stakeholdersService.getAll(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  async remove(payload: RemoveStakeholdersData) {
    return this.stakeholdersService.remove(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  async update(payload: UpdateStakeholdersData) {
    return this.stakeholdersService.update(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  async getOneStakeholder(payload: { uuid: string }) {
    return this.stakeholdersService.getOne(payload);
  }
  // ***** stakeholders end ********** //

  // ***** stakeholders groups start ********** //
  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.ADD_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  async addGroup(payload: AddStakeholdersGroups) {
    return this.stakeholdersService.addGroup(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.UPDATE_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  async updateGroup(payload: UpdateStakeholdersGroups) {
    return this.stakeholdersService.updateGroup(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.DELETE_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  async removeGroup(payload: RemoveStakeholdersGroup) {
    return this.stakeholdersService.removeGroup(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.GET_ALL_GROUPS,
    uuid: process.env.PROJECT_ID,
  })
  async getAllGroups(payload: GetAllGroups) {
    console.log('getting all stakeholders groups', payload);
    return this.stakeholdersService.getAllGroups(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.GET_ALL_GROUPS_BY_UUIDS,
    uuid: process.env.PROJECT_ID,
  })
  async getAllGroupsByUuids(payload: getGroupByUuidDto) {
    return this.stakeholdersService.getAllGroupsByUuids(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.GET_GROUP_DETAILS_BY_UUIDS,
    uuid: process.env.PROJECT_ID,
  })
  async getGroupDetailsByUuids(payload: { uuids: string[] }) {
    return this.stakeholdersService.getGroupDetailsByUuids(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.GET_ONE_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  async getOneGroup(payload: GetOneGroup) {
    console.log('getting one stakeholders group', payload);
    return this.stakeholdersService.getOneGroup(payload);
  }
  // ***** stakeholders groups end ********** //
}
