import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import {seedProject} from "../../prisma/seed-project";
import {seedStellar} from "../../prisma/seed-stellar";
import * as readline from 'readline';
import * as path from 'path';

// running script example:  npx tsx tools/scripts/seed.aa.ts /Users/dipeshrumsan/Projects/rahat/rahat-project-aa
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

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

  const name = await askQuestion('Enter project name: ');
  const description = await askQuestion('Enter project description: ');

  await prisma.$executeRaw(
    Prisma.sql`
        INSERT INTO tbl_projects (uuid, name, description, status, type)
        VALUES (${uuid}::uuid, ${name}, ${description}, 'ACTIVE', 'AA')`
  );

  console.log(`Project created with UUID: ${uuid}`);

  const [devSettings] = await prisma.$queryRaw<any[]>(
    Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='AA_DEV'`])
  );

  const prvKey = devSettings.value.privateKey;

  // Read environment variables
  const envData = await fs.readFile(rootEnv, 'utf8');
  const lines = envData.split('\n') as string[];
  const activeYear = process.env.ACTIVE_YEAR || lines.find(line => line.startsWith('ACTIVE_YEAR'))?.split('=')[1];
  const riverBasin = process.env.RIVER_BASIN || lines.find(line => line.startsWith('RIVER_BASIN'))?.split('=')[1];

  if (!activeYear || !riverBasin) {
    throw new Error('ACTIVE_YEAR and RIVER_BASIN environment variables are required');
  }

  // Create a summary object
  const scriptSummary = {
    project: {
      uuid,
      name,
      description,
      status: 'ACTIVE',
      type: 'AA',
    },
    environment: {
      activeYear,
      riverBasin,
    },
    createdAt: new Date().toISOString(),
  };

  const summaryFilePath = path.join(rootPath || '.', 'project-setup-summary.json');

  try {
    await fs.writeFile(summaryFilePath, JSON.stringify(scriptSummary, null, 2), 'utf8');
    console.log(`Script summary saved to ${summaryFilePath}`);
  } catch (error) {
    console.error('Error writing script summary to file:', error);
  }

  await modifyEnvAndSettings(uuid, prvKey);
  await seedTriggers(uuid);
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
        INSERT INTO tbl_activity_categories (uuid, app, name, "isDeleted", "createdAt", "updatedAt")
        VALUES (${randomUUID()}::uuid, ${projectUuid}, ${category}, false, now(), now())
      `
    );
  }
  console.log('Activity categories seeded successfully.');

  const phases = [
    "PREPAREDNESS",
    "ACTIVATION",
    "READINESS",
  ]

  // read ActiveYear and River basin from project .env
  const envData = await fs.readFile(rootEnv, 'utf8');
  const lines = envData.split('\n') as string[];
  const activeYear = process.env.ACTIVE_YEAR || lines.find(line => line.startsWith('ACTIVE_YEAR'))?.split('=')[1];
  const riverBasin = process.env.RIVER_BASIN || lines.find(line => line.startsWith('RIVER_BASIN'))?.split('=')[1];

  if (!activeYear || !riverBasin) {
    throw new Error('ACTIVE_YEAR and RIVER_BASIN environment variables are required');
  }

  // check if river basin exist or not if, it doesn't exit create one
  const selectRiverBasinQuery = Prisma.sql`
    SELECT * FROM tbl_sources WHERE "riverBasin" = ${riverBasin};
  `
  const riverBasinExists = await triggerPrisma.$executeRaw(selectRiverBasinQuery);
  if(riverBasinExists === 0){
    console.log(`Data source with river basin ${riverBasin} does not exist, creating one...`);
    const createSourceQuery = Prisma.sql`
      INSERT INTO tbl_sources ("uuid", "source", "riverBasin", "createdAt", "updatedAt")
      VALUES (
        ${randomUUID()}::uuid,
        ARRAY['MANUAL', 'DHM', 'GLOFAS']::"DataSource"[],
        ${riverBasin},
        now(),
        now()
      )
    `;
    await triggerPrisma.$executeRaw(createSourceQuery);
    console.log(`Data source with river basin ${riverBasin} created successfully.`);
  }

  // check if phases exist for that riverBasin and activeYear or not if, it doesn't exit create one
  for (const phase of phases) {
    const checkPhaseQuery = Prisma.sql`
      SELECT count(*) FROM tbl_phases
      WHERE "riverBasin" = ${riverBasin} AND "activeYear" = ${activeYear} AND name = ${phase}::"Phases";
    `;

    const [phaseExists] = await triggerPrisma.$queryRaw<any[]>(checkPhaseQuery);

    if (phaseExists.count === 0n) {
      console.log(`Phase ${phase} for river basin ${riverBasin} and active year ${activeYear} does not exist. Creating...`);
      const canTriggerPayout = phase === "PREPAREDNESS" ? false : true;
      const insertPhaseQuery = Prisma.sql`
        INSERT INTO tbl_phases (uuid, name, "activeYear", "riverBasin", "canTriggerPayout", "createdAt", "updatedAt")
        VALUES (
          ${randomUUID()}::uuid,
          ${phase}::"Phases",
          ${activeYear},
          ${riverBasin},
          ${canTriggerPayout}::boolean,
          now(),
          now()
        );
      `;
      await triggerPrisma.$executeRaw(insertPhaseQuery);
      console.log(`Phase ${phase} created successfully.`);
    } else {
      console.log(`Phase ${phase} for river basin ${riverBasin} and active year ${activeYear} already exists.`);
    }
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
    await projectPrisma.setting.upsert({
      where: {
      name: 'DEPLOYER_PRIVATE_KEY',
      },
      create: {
      name: 'DEPLOYER_PRIVATE_KEY',
      value: prvKey,
      dataType: 'STRING',
      isPrivate: true,
      },
      update: {
      value: prvKey,
      dataType: 'STRING',
      isPrivate: true,
      },
    });

    await projectPrisma.setting.upsert({
      where: {
      name: 'RAHAT_ADMIN_PRIVATE_KEY',
      },
      create: {
      name: 'RAHAT_ADMIN_PRIVATE_KEY',
      value: prvKey,
      dataType: 'STRING',
      isPrivate: true,
      },
      update: {
      value: prvKey,
      dataType: 'STRING',
      isPrivate: true,
      },
    });

    await seedProject();
    console.log('ProjectInfo seeded successfully.');
    await seedStellar();
    console.log('Stellar seeded successfully.');

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
