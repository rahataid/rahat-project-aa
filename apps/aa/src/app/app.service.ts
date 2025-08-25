import { Injectable } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import { lowerCaseObjectKeys } from '../utils/utility';

@Injectable()
export class AppService {
  constructor(private readonly settingService: SettingsService) {
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
    const lowerCaseRes = lowerCaseObjectKeys(res);
    return lowerCaseRes;
  }
  async getSettings(dto: any) {
    const { name } = dto;
    const res = await this.settingService.getPublic(name);

    return lowerCaseObjectKeys(res);
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
    if (payload.BLOCKCHAIN) {
      settings.push({
        name: 'BLOCKCHAIN',
        value: payload.BLOCKCHAIN,
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

    //process ADMIN
    if (payload.RAHAT_ADMIN_PRIVATE_KEY) {
      settings.push({
        name: 'RAHAT_ADMIN_PRIVATE_KEY',
        value: payload.RAHAT_ADMIN_PRIVATE_KEY,
        dataType: 'STRING',
        requiredFields: [],
        isReadOnly: false,
        isPrivate: true,
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
