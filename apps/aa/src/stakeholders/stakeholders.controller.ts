import { Controller, UseGuards } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
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
import { MicroserviceAuthGuard, RequireAbility } from '@rumsan/user';
import { ACTIONS, SUBJECTS } from '../common/ability.constants';

@Controller()
@UseGuards(MicroserviceAuthGuard)
export class StakeholdersController {
  constructor(private readonly stakeholdersService: StakeholdersService) {}

  // ***** stakeholders start ********** //
  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.ADD,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.STAKEHOLDER)
  async add(payload: AddStakeholdersData) {
    return this.stakeholdersService.add(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.VALIDATE_BULK_STAKEHOLDERS,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.STAKEHOLDER)
  async validateBulkStakeholders(payload: any) {
    if (!payload) {
      throw new RpcException({
        message: 'No data provided for validation',
        code: 'NO_STAKEHOLDERS_DATA_PROVIDED_FOR_VALIDATION',
      });
    }

    const { user, appId, ...stakeholderData } = payload;
    const normalizedData = Array.isArray(payload)
      ? stakeholderData
      : Object.values(stakeholderData);
    return this.stakeholdersService.validateBulkStakeholders(normalizedData);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.BULK_ADD,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.STAKEHOLDER)
  async bulkAdd(payloads: BulkAddStakeholdersPayload) {
    if (!payloads || !payloads?.data) {
      throw new RpcException({
        message: 'Missing data in bulkAdd payload',
        code: 'MISSING_DATA_IN_BULK_ADD_PAYLOAD',
      });
    }

    const normalizedData = Array.isArray(payloads?.data)
      ? payloads.data
      : Object.values(payloads.data);
    return this.stakeholdersService.bulkAdd({
      data: normalizedData,
      isGroupCreate: payloads?.isGroupCreate,
      groupName: payloads?.groupName,
      groupUuid: payloads?.groupUuid,
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
  @RequireAbility(ACTIONS.DELETE, SUBJECTS.STAKEHOLDER)
  async remove(payload: RemoveStakeholdersData) {
    return this.stakeholdersService.remove(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.STAKEHOLDER)
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
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.STAKEHOLDER)
  async addGroup(payload: AddStakeholdersGroups) {
    return this.stakeholdersService.addGroup(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.UPDATE_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.UPDATE, SUBJECTS.STAKEHOLDER)
  async updateGroup(payload: UpdateStakeholdersGroups) {
    return this.stakeholdersService.updateGroup(payload);
  }

  @MessagePattern({
    cmd: JOBS.STAKEHOLDERS.DELETE_GROUP,
    uuid: process.env.PROJECT_ID,
  })
  @RequireAbility(ACTIONS.DELETE, SUBJECTS.STAKEHOLDER)
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
