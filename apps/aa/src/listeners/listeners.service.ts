import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../constants';
import { WaterLevelNotification } from '../types';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ListenersService {
  constructor(
    private emailService: EmailService,
    private readonly configService: ConfigService
  ) {}

  @OnEvent(EVENTS.WATER_LEVEL_NOTIFICATION)
  async sendEmailNotification(payload: WaterLevelNotification) {
    await this.emailService.sendEmail(
      this.configService.get('EMAIL_TO'),
      `${payload.dataSource}: ${payload.status}`,
      payload.status,
      `<h1>${payload.message}</h1>`
    );
  }
}
