import { Injectable } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import { lowerCaseObjectKeys } from '../utils/utility';

@Injectable()
export class AppService {
  constructor(
    private readonly settingService: SettingsService,
    private readonly prismaService: PrismaService,
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

  async setupProjectSettings(payload: any) {
    const settings: any[] = Array.isArray(payload.settings)
      ? payload.settings
      : [];
    const validSettings = settings.filter((s) => s && s.name);

    let upsertedCount = 0;

    for (const setting of validSettings) {
      const data = {
        name: setting.name,
        value: this.parseValueForPrisma(setting),
        dataType: setting.dataType,
        requiredFields: this.normalizeRequiredFields(setting.requiredFields),
        isReadOnly: Boolean(setting.isReadOnly),
        isPrivate: Boolean(setting.isPrivate),
      };

      await this.prismaService.setting.upsert({
        where: { name: data.name },
        update: {
          value: data.value,
          dataType: data.dataType,
          requiredFields: data.requiredFields,
          isReadOnly: data.isReadOnly,
          isPrivate: data.isPrivate,
        },
        create: data,
      });

      upsertedCount++;
    }

    return {
      message: `Upserted ${upsertedCount} setting(s) successfully`,
    };
  }

  private parseValueForPrisma(setting: any) {
    const { value, dataType } = setting;

    if (typeof value !== 'string') {
      return value;
    }

    if (dataType === 'OBJECT') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    if (dataType === 'NUMBER') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    }

    if (dataType === 'BOOLEAN') {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }

    return value;
  }

  private normalizeRequiredFields(requiredFields: any): string[] {
    if (Array.isArray(requiredFields)) {
      return requiredFields.map((field) => String(field));
    }

    if (typeof requiredFields !== 'string') {
      return [];
    }

    const trimmed = requiredFields.trim();

    if (!trimmed || trimmed === '{}' || trimmed === '[]') {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map((field) => String(field)) : [];
    } catch {
      return [];
    }
  }
}
