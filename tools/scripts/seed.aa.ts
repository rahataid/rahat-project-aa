import { Prisma, PrismaClient } from '@prisma/client';
import { RawDistributedTransactionManager } from './transaction';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { seedProject } from '../../prisma/seed-project';
import { seedStellar } from '../../prisma/seed-stellar';
import { seedOfframp } from '../../prisma/seed-offramp';
import * as readline from 'readline';
import * as path from 'path';

// running script example:
// npx tsx tools/scripts/seed.aa.ts /path/to/.env
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

const envPath = process.argv[2];

if (!envPath) {
  console.error('Environment file path is required as argument');
  console.error('Usage: npx tsx tools/scripts/seed.aa.ts /path/to/.env');
  process.exit(1);
}

async function validateEnvPath() {
  try {
    await fs.access(envPath);
  } catch (error) {
    console.error(`Error: Environment file does not exist at path: ${envPath}`);
    process.exit(1);
  }
}

function resolveEnvValue(value: string, envMap: Map<string, string>): string {
  return value.replace(/\${([^}]+)}/g, (match, key) => {
    const resolvedValue = envMap.get(key);
    if (resolvedValue === undefined) {
      throw new Error(`Environment variable ${key} not found in .env file`);
    }
    return resolveEnvValue(resolvedValue, envMap); // Recursive resolution for nested variables
  });
}

async function readEnvFile(envPath: string) {
  try {
    const envData = await fs.readFile(envPath, 'utf8');
    const envMap = new Map<string, string>();

    // First pass: collect all raw values
    envData.split('\n').forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          envMap.set(key.trim(), valueParts.join('=').trim());
        }
      }
    });

    // Second pass: resolve variables
    const resolvedEnvMap = new Map<string, string>();
    for (const [key, value] of envMap.entries()) {
      try {
        resolvedEnvMap.set(key, resolveEnvValue(value, envMap));
      } catch (error) {
        console.error(`Error resolving value for ${key}:`, error);
        throw error;
      }
    }

    return resolvedEnvMap;
  } catch (error) {
    console.error(`Error reading env file at ${envPath}:`, error);
    throw error;
  }
}

async function initializePrismaClients(envPath: string) {
  const envVariables = await readEnvFile(envPath);

  const coreDbUrl = envVariables.get('CORE_DATABASE_URL');
  const projectDbUrl = envVariables.get('DATABASE_URL');
  const triggerDbUrl = envVariables.get('TRIGGER_DATABASE_URL');

  if (!coreDbUrl || !projectDbUrl || !triggerDbUrl) {
    throw new Error(
      'Database URLs (CORE_DATABASE_URL, DATABASE_URL, TRIGGER_DATABASE_URL) are required in the .env file'
    );
  }

  return {
    prisma: new PrismaClient({ datasourceUrl: coreDbUrl }),
    projectPrisma: new PrismaClient({ datasourceUrl: projectDbUrl }),
    triggerPrisma: new PrismaClient({ datasourceUrl: triggerDbUrl }),
  };
}

let prisma: PrismaClient;
let projectPrisma: PrismaClient;
let triggerPrisma: PrismaClient;

async function main() {
  console.log('#########################');
  console.log('Starting seeding process');
  console.log('#########################');
  await validateEnvPath();

  const clients = await initializePrismaClients(envPath);
  prisma = clients.prisma;
  projectPrisma = clients.projectPrisma;
  triggerPrisma = clients.triggerPrisma;

  const txManager = new RawDistributedTransactionManager([
    prisma,
    projectPrisma,
    triggerPrisma,
  ]);

  try {
    const envVariables = await readEnvFile(envPath);

    const name = await askQuestion('Enter project name: ');
    const description = await askQuestion('Enter project description: ');
    const privateKey = await askQuestion('Enter private key: ');

    await txManager.cleanupOrphanedTransactions();

    await txManager.beginAll();

    const uuid = randomUUID();
    await txManager.executeRaw(
      0,
      Prisma.sql`
      INSERT INTO tbl_projects (uuid, name, description, status, type)
      VALUES (${uuid}::uuid, ${name}, ${description}, 'ACTIVE', 'aa')`
    );

    console.log('--------------------------------');
    console.log(`Project ${name} created with UUID: ${uuid}`);
    console.log('--------------------------------');

    const activeYear = envVariables.get('ACTIVE_YEAR');
    const riverBasin = envVariables.get('RIVER_BASIN');

    if (!activeYear || !riverBasin) {
      throw new Error(
        'ACTIVE_YEAR and RIVER_BASIN variables are required in the .env file'
      );
    }

    const scriptSummary = {
      envFile: envPath,
      project: {
        uuid,
        name,
        description,
        status: 'ACTIVE',
        type: 'aa',
      },
      environment: {
        activeYear,
        riverBasin,
      },
      createdAt: new Date().toISOString(),
    };

    const projectPath =
      envVariables.get('PROJECT_PATH') || path.dirname(envPath);
    const summaryFilePath = path.join(
      projectPath,
      'project-setup-summary.json'
    );

    await fs.writeFile(
      summaryFilePath,
      JSON.stringify(scriptSummary, null, 2),
      'utf8'
    );
    console.log(`Script summary saved to ${summaryFilePath}`);
    console.log('--------------------------------');
    await modifyEnvAndSettings(uuid, privateKey, txManager);
    console.log('--------------------------------');
    await seedTriggers(uuid, txManager);
    console.log('--------------------------------');
    await txManager.prepareAll();
    console.log('--------------------------------');
    await txManager.commitAll();
    console.log('--------------------------------');
  } catch (error) {
    console.log('#########################');
    console.log('Rolling back transactions');
    console.log('#########################');

    await txManager.rollbackAll();
    console.error('Error writing script summary to file:', error);
  }
}

async function seedTriggers(
  projectUuid: string,
  txManager: RawDistributedTransactionManager
) {
  try {
    console.log('#########################');
    console.log('Seeding Triggers');
    console.log('#########################');
    const categories = [
      'General Action',
      'Early Warning Communication',
      'Cleaning The Drains',
      'Strengthening Embankments By Placing Sand Bags',
      'Support For Early Harvesting',
      'People, Livestock And Property Evacuation',
      'Complaints Handling Mechanism',
      'Managing Drinking Water',
      'Cash Transfer',
    ];

    for (const category of categories) {
      await txManager.executeRaw(
        2,
        Prisma.sql`
      INSERT INTO tbl_activity_categories (uuid, app, name, "isDeleted", "createdAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${projectUuid}, ${category}, false, now(), now())
    `
      );
    }

    console.log('\n--------------------------------');
    console.log('Activity categories seeded successfully.');
    console.log('--------------------------------');

    const phases = ['PREPAREDNESS', 'ACTIVATION', 'READINESS'];

    const envVariables = await readEnvFile(envPath);
    const activeYear = envVariables.get('ACTIVE_YEAR');
    const riverBasin = envVariables.get('RIVER_BASIN');

    const selectRiverBasinQuery = Prisma.sql`
    SELECT * FROM tbl_sources WHERE "riverBasin" = ${riverBasin};
  `;
    const riverBasinExists = await txManager.executeRaw(
      2,
      selectRiverBasinQuery
    );
    if (riverBasinExists === 0) {
      console.log(
        `Data source with river basin ${riverBasin} does not exist, creating one...`
      );
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
      await txManager.executeRaw(2, createSourceQuery);
      console.log(
        `Data source with river basin ${riverBasin} created successfully.`
      );
    }

    for (const phase of phases) {
      const checkPhaseQuery = Prisma.sql`
      SELECT count(*) FROM tbl_phases
      WHERE "riverBasin" = ${riverBasin} AND "activeYear" = ${activeYear} AND name = ${phase}::"Phases";
    `;

      const [phaseExists] = (await txManager.queryRaw(
        2,
        checkPhaseQuery
      )) as any[];

      if (phaseExists.count === 0n) {
        console.log(
          `Phase ${phase} for river basin ${riverBasin} and active year ${activeYear} does not exist. Creating...`
        );
        const canTriggerPayout = phase === 'PREPAREDNESS' ? false : true;
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
        await txManager.executeRaw(2, insertPhaseQuery);
        console.log(`Phase ${phase} created successfully.`);
      } else {
        console.log(
          `Phase ${phase} for river basin ${riverBasin} and active year ${activeYear} already exists.`
        );
      }
    }
    console.log('\n--------------------------------');
    console.log('Phases seeded successfully.');
    console.log('--------------------------------');
  } catch (error) {
    console.error('Error seeding triggers:', error);
    throw error;
  }
}

async function modifyEnvAndSettings(
  uuid: string,
  prvKey: string,
  txManager: RawDistributedTransactionManager
) {
  try {
    console.log('#########################');
    console.log('Seeding AA Project');
    console.log('#########################');
    const envVariables = await readEnvFile(envPath);
    const activeYear = envVariables.get('ACTIVE_YEAR');
    const riverBasin = envVariables.get('RIVER_BASIN');

    if (!activeYear || !riverBasin) {
      throw new Error(
        'ACTIVE_YEAR and RIVER_BASIN variables are required in the .env file'
      );
    }

    let data = await fs.readFile(envPath, 'utf8');
    const lines = data.split('\n') as string[];

    const newLines = lines.map((line) => {
      if (line.startsWith('PROJECT_ID')) {
        return `PROJECT_ID=${uuid}`;
      }
      return line;
    });

    const newData = newLines.join('\n');
    await fs.writeFile(envPath, newData, 'utf8');

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

    await seedOfframp();
    console.log('Payment provider seeded successfully.');

    console.log(envPath);
    console.log('File updated.');
  } catch (error) {
    console.error('Error modifying .env file:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([
      prisma?.$disconnect(),
      projectPrisma?.$disconnect(),
      triggerPrisma?.$disconnect(),
    ]);
  });
