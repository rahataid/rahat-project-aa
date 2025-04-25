import { PrismaService } from '@rumsan/prisma';
import { PrismaClient, Phase } from '@prisma/client';
import { SettingsService } from '@rumsan/settings';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);
const scb_base_url = process.env['SCB_BASE_URL'];
const scb_access_token = process.env['SCB_ACCESS_TOKEN'];

const phaseData = [
  {
    uuid: 'd8717555-3a71-4d5a-8a0d-fec1be26ce3b',
    name: Phase.PREPAREDNESS,
    isActive: true,
  },
  {
    uuid: 'ecce09ad-2364-4e21-a59a-09b0f3a3fde5',
    name: Phase.READINESS,
    canRevert: true,
  },
  {
    uuid: 'c7e69410-f71c-40c0-bd06-6bb95494fd82',
    name: Phase.ACTIVATION,
    canTriggerPayout: true,
  },
];

const activityCategoriesData = [
  {
    uuid: '33c6ce0f-b6ef-4d07-9e08-1081c7906a58',
    name: 'General Action',
  },
  {
    uuid: '81081d98-ad52-4dff-b324-2aa597142488',
    name: 'Early Warning Communication',
  },
  {
    uuid: '0a824dad-360f-4c43-af86-c110f81a019a',
    name: 'Cleaning The Drains',
  },
  {
    uuid: '6fa910ef-0893-4141-9878-c54667cb2143',
    name: 'Strengthening Embankments By Placing Sand Bags',
  },
  {
    uuid: 'cabfdcbd-e13b-4e67-ac07-f767ec0bcd3f',
    name: 'Support For Early Harvesting',
  },
  {
    uuid: '9d086c69-e058-4bea-973d-97f78fb93917',
    name: 'People, Livestock And Property Evacuation',
  },
  {
    uuid: '132c20d0-3a74-4e9c-beaa-c7d44bcecf08',
    name: 'Complaints Handling Mechanism',
  },
  {
    uuid: '7cf2aed6-cfe9-45bb-a12f-4b138e7911bf',
    name: 'Managing Drinking Water',
  },
  {
    uuid: '6a680e6e-1f45-4619-a398-0ca127dec00e',
    name: 'Cash Transfer',
  },
];

const activities: Array<{
  title: string;
  leadTime: string;
  phaseId: string;
  categoryId: string;
  responsibility: string;
  source: string;
  description: string;
}> = [
  // preparedness action activities, general action
  {
    title: 'Preparedness activity one.',
    leadTime: 'test lead time',
    description: 'this is description of activity',
    responsibility: 'Member Secretary - Local DMC',
    source: 'Municipality',
    phaseId: 'd8717555-3a71-4d5a-8a0d-fec1be26ce3b',
    categoryId: '33c6ce0f-b6ef-4d07-9e08-1081c7906a58',
  },
  {
    title: 'Preparedness activity two.',
    leadTime: 'test lead time',
    description: 'this is description of activity',
    responsibility: 'Member Secretary - Local DMC',
    source: 'Municipality',
    phaseId: 'd8717555-3a71-4d5a-8a0d-fec1be26ce3b',
    categoryId: '81081d98-ad52-4dff-b324-2aa597142488',
  },
  {
    title: 'Readiness activity one.',
    leadTime: 'test lead time',
    description: 'this is description of activity',
    responsibility: 'Member Secretary - Local DMC',
    source: 'Municipality',
    phaseId: 'ecce09ad-2364-4e21-a59a-09b0f3a3fde5',
    categoryId: '7cf2aed6-cfe9-45bb-a12f-4b138e7911bf',
  },
  {
    title: 'Readiness activity two.',
    leadTime: 'test lead time',
    description: 'this is description of activity',
    responsibility: 'Member Secretary - Local DMC',
    source: 'Municipality',
    phaseId: 'ecce09ad-2364-4e21-a59a-09b0f3a3fde5',
    categoryId: '0a824dad-360f-4c43-af86-c110f81a019a',
  },
  {
    title: 'Action activity one.',
    leadTime: 'test lead time',
    description: 'this is description of activity',
    responsibility: 'Member Secretary - Local DMC',
    source: 'Municipality',
    phaseId: 'c7e69410-f71c-40c0-bd06-6bb95494fd82',
    categoryId: '7cf2aed6-cfe9-45bb-a12f-4b138e7911bf',
  },
  {
    title: 'Action activity two.',
    leadTime: 'test lead time',
    description: 'this is description of activity',
    responsibility: 'Member Secretary - Local DMC',
    source: 'Municipality',
    phaseId: 'c7e69410-f71c-40c0-bd06-6bb95494fd82',
    categoryId: '6a680e6e-1f45-4619-a398-0ca127dec00e',
  },
];

const main = async () => {
  // ***** seed phases ****
  for (const phase of phaseData) {
    await prisma.phases.create({
      data: phase,
    });
  }
  // ***** seed phases complete ***

  // ***** seed activity categories ****
  for (const category of activityCategoriesData) {
    await prisma.activityCategories.create({
      data: category,
    });
  }
  // ***** seed activity categories ***

  // ***** seed activities ****
  // for (const activity of activities) {
  //     await prisma.activities.create({
  //         data: activity
  //     })
  // }
  // ***** seed activities complete ***

  // ***** seed settings start ***
  // await settings.create({
  //     name: 'DATASOURCE',
  //     value: {
  //         DHM: {
  //             location: 'Karnali at Chisapani',
  //             url: 'https://bipadportal.gov.np/api/v1'
  //         },
  //         GLOFAS: {
  //             location: 'Karnali at Chisapani',
  //             url: "https://ows.globalfloods.eu/glofas-ows/ows.py",
  //             bbox: "8753364.64714296,3117815.425733483,9092541.220653716,3456991.999244238", //bounding box for karnali at chisapani
  //             i: "721", //coordinate for station
  //             j: "303"
  //         }
  //     },
  //     isPrivate: false
  // })
  await settings.create({
    name: 'HAZARD_TYPE',
    value: 'River Flood',
    isPrivate: false,
  });

  await settings.create({
    name: 'SCB',
    value: { baseUrl: scb_base_url, accessToken: scb_access_token },
    isPrivate: false,
  });
  // ***** seed settings complete ***

  const stellarValue = {
    tenantName: 'sandab',
    server: 'https://soroban-testnet.stellar.org',
    keypair: 'SAKQYFOKZFZI2LDGNMMWN3UQA6JP4F3JVUEDHVUYYWHCVQIE764WTGBU',
    email: 'owner@sandab.stellar.rahat.io',
    password: 'Password123!',
  };

  await settings.create({
    name: 'STELLAR_SETTINGS',
    value: stellarValue,
    isPrivate: false,
  });
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });
