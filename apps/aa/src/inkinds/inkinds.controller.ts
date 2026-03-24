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
} from './dto/inkind.dto';
import { AddInkindStockDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
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
  getAllStockMovements() {
    return this.inkindsService.getAllStockMovements();
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
    cmd: JOBS.INKINDS.GET_AVAILABLE_INKIND_BENEFICIARY_PHONE,
    uuid: process.env.PROJECT_ID,
  })
  getAvailableInkindByBeneficiary(@Payload() Payload: { number: string }) {
    return this.inkindsService.getAvailableInkindByBeneficiary(Payload.number);
  }
}
