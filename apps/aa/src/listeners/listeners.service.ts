import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../constants';
import { WaterLevelNotification } from '../types';
import { EmailService } from './email.service';

@Injectable()
export class ListenersService {
  constructor(private emailService: EmailService) {}

  @OnEvent(EVENTS.WATER_LEVEL_NOTIFICATION)
  async onProjectCreated(payload: WaterLevelNotification) {
    console.log('water level notification');
    console.log(payload);
    await this.emailService.sendEmail(
      'avash700@gmail.com',
      `${payload.dataSource}: ${payload.status}`,
      payload.status,
      `<h1>${payload.message}</h1>`
    );
  }
}
