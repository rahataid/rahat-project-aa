// prisma/seedForecastTabConfig.ts
import { SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';

const prismaService = new PrismaService();

export const seedForecastTabConfig = async () => {
  const tabConfig = {
    name: 'FORECAST_TAB_CONFIG',
    value: {
      tabs: [
        { label: 'DHM', value: 'dhm' },
        { label: 'GLOFAS', value: 'glofas' },
        { label: 'Daily Monitoring', value: 'dailyMonitoring' },
        { label: 'Gauge Reading', value: 'gaugeReading', hasDatePicker: true },
        { label: 'GFHDetails', value: 'gfh' },
        { label: 'ExternalLinks', value: 'externalLinks' },
      ],
    },
    dataType: SettingDataType.OBJECT,
    isPrivate: false,
    requiredFields: [],
    isReadOnly: false,
  };

  await prismaService.setting.upsert({
    where: {
      name: tabConfig.name,
    },
    create: tabConfig,
    update: tabConfig,
  });

  console.log('Forecast tab configuration seeded successfully.');
};

seedForecastTabConfig()
  .then(async () => {
    await prismaService.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prismaService.$disconnect();
  });
