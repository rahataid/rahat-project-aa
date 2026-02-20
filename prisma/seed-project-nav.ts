// prisma/seedForecastTabConfig.ts
import { SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';

const prismaService = new PrismaService();

export const seedProjectNavConfig = async () => {
  const navConfig = {
    name: 'PROJECT_NAV_CONFIG',
    value: {
      navsettings: [
        {
          icon: 'LayoutDashboard',
          path: '',
          roles: [
            'ADMIN',
            'MANAGER',
            'UNICEF_DONOR',
            'UNICEF_FIELD_OFFICE',
            'UNICEF_HEAD_OFFICE',
          ],
          title: 'Dashboard',
        },
        {
          icon: 'UsersRound',
          path: 'beneficiary',
          title: 'Project Beneficiaries',
        },
        {
          icon: 'CircleUserRound',
          path: 'stakeholders',
          title: 'Stakeholders',
        },
        {
          icon: 'HardDrive',
          path: 'data-sources',
          title: 'Forecast Data',
        },
        {
          icon: 'SquareActivity',
          path: 'activities',
          title: 'Activities',
        },
        {
          icon: 'CloudAlert',
          path: 'trigger-statements',
          title: 'Trigger Statements',
        },
        {
          icon: 'Coins',
          path: 'fund-management',
          roles: [
            'ADMIN',
            'MANAGER',
            'UNICEF_DONOR',
            'UNICEF_FIELD_OFFICE',
            'UNICEF_HEAD_OFFICE',
          ],
          title: 'Fund Management',
        },
        {
          icon: 'HandCoinsIcon',
          path: 'payout',
          roles: ['ADMIN', 'MANAGER'],
          title: 'Payout',
        },
        {
          icon: 'Store',
          path: 'vendors',
          roles: ['ADMIN', 'MANAGER'],
          title: 'Vendors',
        },
        {
          icon: 'SmartphoneNfc',
          path: 'communication-logs',
          roles: ['ADMIN', 'MANAGER'],
          title: 'Communication Logs',
        },
        {
          icon: 'NotebookPenIcon',
          path: 'grievances',
          title: 'Grievances',
        },
      ],
    },
    dataType: SettingDataType.OBJECT,
    isPrivate: false,
    requiredFields: [],
    isReadOnly: false,
  };

  await prismaService.setting.upsert({
    where: {
      name: navConfig.name,
    },
    create: navConfig,
    update: navConfig,
  });

  console.log('Project nav configure seeded successfully.');
};

seedProjectNavConfig()
  .then(async () => {
    await prismaService.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prismaService.$disconnect();
  });
