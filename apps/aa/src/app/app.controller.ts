import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getData() {
    return this.appService.getData();
  }

  @MessagePattern({ cmd: JOBS.SETTINGS.CREATE, uuid: process.env.PROJECT_ID })
  addSettings(dto: any) {
    return this.appService.addSettings(dto);
  }

  @MessagePattern({ cmd: JOBS.SETTINGS.LIST, uuid: process.env.PROJECT_ID })
  listSettings() {
    return this.appService.listSettings()
  }

  @MessagePattern({ cmd: JOBS.SETTINGS.GET, uuid: process.env.PROJECT_ID })
  getSettings(dto: any) {
    return this.appService.getSettings(dto)
  }

  @MessagePattern({ cmd: JOBS.APP.RESET_ALL, uuid: process.env.PROJECT_ID })
  resetAll() {
    return this.appService.resetAll()
  }

  //Setup Settings
  @MessagePattern({ cmd: JOBS.PROJECT.SETUP, uuid: process.env.PROJECT_ID })
  setupProjectSettings(payload: any) {
    return this.appService.setupProjectSettings(payload);
  }
}
