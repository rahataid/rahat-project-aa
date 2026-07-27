import { Injectable } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import { Prisma } from '@prisma/client';
import {
  lowerCaseObjectKeys,
  normalizeRequiredFields,
  parseValueForPrisma,
} from '../utils/utility';
import { sanitizeSettingValue } from './settings-sanitizer';
import { UpdateSettingsPayloadDto } from './dto/update-settings-payload.dto';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class AppService {
  constructor(
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService
  ) {
    this.refreshSettings();
  }

  getData(): { message: string } {
    return { message: 'Hello API' };
  }

  async addSettings(dto: any) {
    return this.settingService.create(dto);
  }

  async listSettings() {
    const res = await this.settingService.listAll();
    const sanitized = res.map((setting: any) => ({
      ...setting,
      value: sanitizeSettingValue(setting.name, setting.value),
    }));
    return lowerCaseObjectKeys(sanitized);
  }
  async getSettings(dto: any) {
    const { name } = dto;
    const res = await this.settingService.getPublic(name);

    return lowerCaseObjectKeys(res);
  }

  async updateSettingsBulk(dto: UpdateSettingsPayloadDto) {
    const { projectId, settings } = dto;

    const upserted = [];

    for (const setting of settings) {
      const name = setting.name.toUpperCase();
      const value = parseValueForPrisma(setting) as Prisma.InputJsonValue;
      const result = await this.prisma.setting.upsert({
        where: { name },
        update: {
          value,
          dataType: setting.dataType,
          requiredFields: normalizeRequiredFields(setting.requiredFields),
          isReadOnly: Boolean(setting.isReadOnly),
          isPrivate: Boolean(setting.isPrivate),
        },
        create: {
          name,
          value,
          dataType: setting.dataType,
          requiredFields: normalizeRequiredFields(setting.requiredFields),
          isReadOnly: Boolean(setting.isReadOnly),
          isPrivate: Boolean(setting.isPrivate),
        },
      });
      upserted.push(result.name);
    }

    await this.refreshSettings();

    return { projectId, upserted };
  }

  async refreshSettings() {
    const d = await this.settingService.listPublic();
    require('./settings.config').setSettings(d);
  }

  static generateMessagePattern(patternPrefix: string) {
    const settings =
      require('./settings.config').getSettings('PROJECT_SETTINGS');
    return { cmd: patternPrefix, uuid: settings.UUID || '' };
  }

  async resetAll() {
    return 'ok';
  }

  //TODO: optimize for multiple dynamic settings
  async setupProjectSettings(payload: any) {
    const settings = [];

    // Process contracts
    if (payload.CONTRACTS) {
      settings.push({
        name: 'CONTRACTS',
        value: payload.CONTRACTS,
        dataType: 'OBJECT',
        requiredFields: [],
        isReadOnly: false,
        isPrivate: false,
      });
    }

    // Process chainSettings
    if (payload.CHAIN_SETTINGS) {
      settings.push({
        name: 'CHAIN_SETTINGS',
        value: payload.CHAIN_SETTINGS,
        dataType: 'OBJECT',
        requiredFields: [],
        isReadOnly: false,
        isPrivate: false,
      });
    }

    // Process subgraphUrl
    if (payload.SUBGRAPH_URL) {
      settings.push({
        name: 'SUBGRAPH_URL',
        value: payload.SUBGRAPH_URL,
        dataType: 'OBJECT',
        requiredFields: [],
        isReadOnly: false,
        isPrivate: false,
      });
    }

    if (payload.DEPLOYER_PRIVATE_KEY) {
      settings.push({
        name: 'DEPLOYER_PRIVATE_KEY',
        value: payload.DEPLOYER_PRIVATE_KEY,
        dataType: 'STRING',
        requiredFields: [],
        isReadOnly: false,
        isPrivate: false,
      });
    }

    if (payload.ADMIN) {
      settings.push({
        name: 'ADMIN',
        value: payload.ADMIN,
        dataType: 'OBJECT',
        requiredFields: [],
        isReadOnly: false,
        isPrivate: false,
      });
    }

    await this.settingService.bulkCreate(settings);
    return { message: 'Project Setup Successfully' };
  }
}
