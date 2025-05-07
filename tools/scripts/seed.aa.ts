import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';

const prisma = new PrismaClient({
  datasourceUrl: process.env.CORE_DATABASE_URL as string,
});

const projectPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL as string,
});

const triggerPrisma = new PrismaClient({
  datasourceUrl: process.env.TRIGGER_DATABASE_URL as string,
});

const rootPath = process.argv[2];
const rootEnv = `${rootPath}/.env`;

async function main() {
  const uuid = randomUUID();

  await prisma.$executeRaw(
    Prisma.sql`
        INSERT INTO tbl_projects (uuid, name, description, status, type)
        VALUES (${uuid}::uuid, 'AA', 'AA Project', 'ACTIVE', 'AA')`
  );

  console.log('Project created successfully.');

  const [devSettings] = await prisma.$queryRaw<any[]>(
    Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='AA_DEV'`])
  );

  const prvKey = devSettings.value.privateKey;

  await modifyEnvAndSettings(uuid, prvKey);
}

async function seedTriggers(projectUuid: string) {
  // seed activities categories
  const categories = [
    'Early Warning Communication',
    'Cleaning The Drains',
    'Strengthening Embankments By Placing Sand Bags',
    'Support For Early Harvesting',
    'People, Livestock And Property Evacuation',
    'Complaints Handling Mechanism',
    'Managing Drinking Water',
  ];

  for (const category of categories) {
    await triggerPrisma.$executeRaw(
      Prisma.sql`
        INSERT INTO tbl_activity_categories (uuid, app, name, is_deleted, created_at)
        VALUES (${randomUUID()}::uuid, ${projectUuid}, ${category}, false, now())
      `
    );
  }
  console.log('Activity categories seeded successfully.');

  // Seed Phases with Active year and River Basin
  // Phases.PREPAREDNESS, Phases.ACTIVATION, Phases.READINESS
  const phases = [
    "PREPAREDNESS",
    "ACTIVATION",
    "READINESS",
  ]
  // read ActiveYear and River basin from project .env
  const envData = await fs.readFile(rootEnv, 'utf8');
  const lines = envData.split('\n') as string[];
  const activeYear = lines.find(line => line.startsWith('ACTIVE_YEAR'))?.split('=')[1];
  const riverBasin = lines.find(line => line.startsWith('RIVER_BASIN'))?.split('=')[1];

  if (!activeYear || !riverBasin) {
    throw new Error('ACTIVE_YEAR and RIVER_BASIN environment variables are required');
  }

  // Updated phase seeding with raw SQL upsert query
  for (const phase of phases) {
    await triggerPrisma.$executeRaw(
      Prisma.sql`
        INSERT INTO tbl_phases (uuid, name, active_year, river_basin, is_deleted, created_at, updated_at)
        VALUES (
          ${randomUUID()}::uuid,
          ${phase},
          ${activeYear},
          ${riverBasin},
          false,
          now(),
          now()
        )
        ON CONFLICT (river_basin, active_year, name)
        DO UPDATE SET
          active_year = ${activeYear},
          river_basin = ${riverBasin},
          updated_at = now()
      `
    );
  }

  console.log('Phases seeded successfully.');

}

async function modifyEnvAndSettings(uuid: string, prvKey: string) {
  try {
    let data = await fs.readFile(rootEnv, 'utf8');
    const lines = data.split('\n') as string[];

  const activeYear = lines.find(line => line.startsWith('ACTIVE_YEAR'))?.split('=')[1];
  const riverBasin = lines.find(line => line.startsWith('RIVER_BASIN'))?.split('=')[1];

  if (!activeYear || !riverBasin) {
    throw new Error('ACTIVE_YEAR and RIVER_BASIN environment variables are required');
  }

    const newLines = lines.map((line) => {
      if (line.startsWith('PROJECT_ID')) {
        return `PROJECT_ID=${uuid}`;
      }
      return line;
    });

    const newData = newLines.join('\n');

    await fs.writeFile(rootEnv, newData, 'utf8');

    await projectPrisma.setting.create({
      data: {
        name: 'DEPLOYER_PRIVATE_KEY',
        value: prvKey,
        dataType: 'STRING',
        isPrivate: true,
      },
    });

    await projectPrisma.setting.create({
      data: {
        name: 'RAHAT_ADMIN_PRIVATE_KEY',
        value: prvKey,
        dataType: 'STRING',
        isPrivate: true,
      },
    });

    await projectPrisma.setting.upsert({
      where: {
        name: 'PROJECTINFO',
      },
      create: {
        name: 'PROJECTINFO',
        value: {
          "ACTIVE_YEAR": activeYear,
          "RIVER_BASIN": riverBasin,
        },
        dataType: 'OBJECT',
        isPrivate: false,
        isReadOnly: false,
      },
      update: {
        value: {
          "ACTIVE_YEAR": activeYear,
          "RIVER_BASIN": riverBasin,
        },
        isPrivate: false,
        isReadOnly: false,
      }

    })
    console.log(rootEnv);
    console.log('File updated.');
  } catch (error) {
    console.error('Error modifying .env file:', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
