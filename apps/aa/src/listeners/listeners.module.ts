import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ListenersService } from './listeners.service';

@Module({
  providers: [EmailService, ListenersService],
})
export class ListenersModule {}
