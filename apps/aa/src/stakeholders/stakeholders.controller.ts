import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { StakeholdersService } from './stakeholders.service';
import { AddStakeholdersData, AddStakeholdersGroups, GetAllGroups, GetStakeholdersData, RemoveStakeholdersData, RemoveStakeholdersGroup, UpdateStakeholdersGroups } from './dto';

@Controller()
export class StakeholdersController {
    constructor(private readonly stakeholdersService: StakeholdersService) { }

    // ***** stakeholders start ********** //
    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.ADD,
        uuid: process.env.PROJECT_ID,
    })
    async add(payload: AddStakeholdersData) {
        return this.stakeholdersService.add(payload)
    }

    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll(payload: GetStakeholdersData) {
        return this.stakeholdersService.getAll(payload)
    }

    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.REMOVE,
        uuid: process.env.PROJECT_ID,
    })
    async remove(payload: RemoveStakeholdersData) {
        return this.stakeholdersService.remove(payload)
    }


    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.UPDATE,
        uuid: process.env.PROJECT_ID,
    })
    async update(payload: RemoveStakeholdersData) {
        return this.stakeholdersService.update(payload)
    }
    // ***** stakeholders end ********** //


    // ***** stakeholders groups start ********** //
    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.ADD_GROUP,
        uuid: process.env.PROJECT_ID,
    })
    async addGroup(payload: AddStakeholdersGroups) {
        return this.stakeholdersService.addGroup(payload)
    }

    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.UPDATE_GROUP,
        uuid: process.env.PROJECT_ID,
    })
    async updateGroup(payload: UpdateStakeholdersGroups) {
        return this.stakeholdersService.updateGroup(payload)
    }

    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.DELETE_GROUP,
        uuid: process.env.PROJECT_ID,
    })
    async removeGroup(payload: RemoveStakeholdersGroup) {
        return this.stakeholdersService.removeGroup(payload)
    }

    @MessagePattern({
        cmd: JOBS.STAKEHOLDERS.GET_ALL_GROUPS,
        uuid: process.env.PROJECT_ID,
    })
    async getAllGroups(payload: GetAllGroups) {
        return this.stakeholdersService.getAllGroups(payload)
    }
    // ***** stakeholders groups end ********** //

}
