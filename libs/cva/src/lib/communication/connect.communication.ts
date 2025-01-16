import { Injectable } from '@nestjs/common';
import { getClient } from '@rumsan/connect/src/clients';
import { PrismaService } from '@rumsan/prisma';

const SETTINGS = {
  NAME: 'COMMUNICATION',
  APP_ID: 'APP_ID',
  URL: 'URL',
};

export type CommsClient = ReturnType<typeof getClient>;

@Injectable()
export class ConnectCommunicationService {
  private client: CommsClient;

  constructor(private prisma: PrismaService) {}

  async fetchCommSettings() {
    const row: any = await this.prisma.setting.findUnique({
      where: {
        name: SETTINGS.NAME,
      },
    });
    if (!row) return null;
    return {
      APP_ID: row?.value?.APP_ID,
      URL: row?.value?.URL,
    };
  }

  async init() {
    const settings = await this.fetchCommSettings();
    console.log('settings=>', settings);
    if (!settings) {
      console.error('Communication settings not found');
      return;
    }
    this.client = getClient({
      baseURL: settings.URL,
    });
    this.client.setAppId(settings.APP_ID);
  }

  async getClient() {
    if (!this.client) {
      await this.init();
      return this.client;
    }
    return this.client;
  }
}
