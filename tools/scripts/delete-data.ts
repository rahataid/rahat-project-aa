import { PrismaClient, Prisma } from '@prisma/client';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import { RawDistributedTransactionManager } from './transaction';

// running script example:
// npx tsx tools/scripts/delete-data.ts /path/to/.env

async function validateEnvPath(envPath: string) {
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

async function clearCoreBeneficiaries(txManager: RawDistributedTransactionManager) {
  console.log('--------------------------------');
  console.log('Deleting Core Beneficiaries\n');
  
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_beneficiaries_gorup_projects;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_beneficiaries_projects;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_grouped_beneficiaries;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_beneficiaries_pii;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_beneficiaries_group;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_beneficiaries;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_temp_group;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_temp_beneficiary_group;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_temp_beneficiaries;`);
  
  console.log('Core Beneficiaries deleted successfully.');
  console.log('--------------------------------\n');
}

async function clearAABeneficiaries(txManager: RawDistributedTransactionManager) {
  console.log('--------------------------------');
  console.log('Deleting AA Beneficiaries\n');

  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiaries_to_groups;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiaries_groups_payouts;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiaries_groups_tokens;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiaries_groups;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiary_groups;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiary_otp;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiary_redeem;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_disbursement;`);
  await txManager.executeRaw(1, Prisma.sql`DELETE FROM tbl_beneficiaries;`);

  console.log('AA Beneficiaries and related data cleared successfully.');
  console.log('--------------------------------\n');
}

async function clearUsers(txManager: RawDistributedTransactionManager) {
  console.log('--------------------------------');
  console.log('Deleting Users\n');

  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_user_roles;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_permissions;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_roles;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_auth;`);
  await txManager.executeRaw(0, Prisma.sql`DELETE FROM tbl_users;`);

  console.log('Users and related data cleared successfully.');
  console.log('--------------------------------\n');
}

async function clearTriggerStatements(txManager: RawDistributedTransactionManager) {
  console.log('--------------------------------');
  console.log('Deleting Trigger Statements\n');

  await txManager.executeRaw(2, Prisma.sql`DELETE FROM tbl_triggers;`);

  console.log('Trigger statements cleared successfully.');
  console.log('--------------------------------\n');
}

async function clearTriggerActivities(txManager: RawDistributedTransactionManager) {
  console.log('--------------------------------');
  console.log('Deleting Trigger Activities\n');

  await txManager.executeRaw(2, Prisma.sql`DELETE FROM tbl_activities;`);

  console.log('Trigger activities cleared successfully.');
  console.log('--------------------------------\n');
}

type ClearAction = 
  | 'beneficiaries' 
  | 'users' 
  | 'trigger-statements'
  | 'trigger-activities'
  | 'trigger-all';

const clearPlugins: Record<
  ClearAction,
  (txManager: RawDistributedTransactionManager) => Promise<void>
> = {
  beneficiaries: async (txManager) => {
    await clearCoreBeneficiaries(txManager);
    await clearAABeneficiaries(txManager);
  },
  users: clearUsers,
  'trigger-statements': clearTriggerStatements,
  'trigger-activities': clearTriggerActivities,
  'trigger-all': async (txManager) => {
    await clearTriggerStatements(txManager);
    await clearTriggerActivities(txManager);
  },
};

async function main() {
  const envPath = process.argv[2];

  if (!envPath) {
    console.error('Environment file path is required as argument');
    console.error('Usage: npx tsx tools/scripts/delete-data.ts /path/to/.env');
    process.exit(1);
  }

  await validateEnvPath(envPath);

  const { prisma, projectPrisma, triggerPrisma } = await initializePrismaClients(envPath);
  const txManager = new RawDistributedTransactionManager([prisma, projectPrisma, triggerPrisma]);

  try {
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'actions',
        message: 'Select data to clear:',
        choices: [
          {
            name: 'Clear Beneficiaries (includes Disbursements)',
            value: 'beneficiaries',
          },
          { 
            name: 'Clear Users', 
            value: 'users' 
          },
          { 
            name: 'Clear Trigger Statements Only', 
            value: 'trigger-statements' 
          },
          { 
            name: 'Clear Trigger Activities Only', 
            value: 'trigger-activities' 
          },
          { 
            name: 'Clear All Trigger Data', 
            value: 'trigger-all' 
          },
        ],
      },
    ]);

    const actions = answers.actions as ClearAction[];
    console.log('Selected actions:', answers);

    if (actions.length === 0) {
      console.log('No actions selected. Exiting...');
      return;
    }

    console.log('#########################');
    console.log('Starting deletion process');
    console.log('#########################');

    await txManager.cleanupOrphanedTransactions();
    await txManager.beginAll();

    for (const action of actions) {
      if (clearPlugins[action]) {
        await clearPlugins[action](txManager);
      } else {
        console.error(`Invalid action: ${action}`);
      }
    }

    await txManager.prepareAll();
    await txManager.commitAll();

    console.log('#########################');
    console.log('Deletion process completed');
    console.log('#########################');
  } catch (error) {
    console.log('#########################');
    console.log('Rolling back transactions');
    console.log('#########################');
    await txManager.rollbackAll();
    console.error('Error during deletion process:', error);
    process.exit(1);
  } finally {
    await Promise.all([
      prisma.$disconnect(),
      projectPrisma.$disconnect(),
      triggerPrisma.$disconnect(),
    ]);
  }
}

main();