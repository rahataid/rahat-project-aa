import { PrismaClient, SettingDataType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// Running script example:
// npx tsx tools/scripts/seed-cash-tracker-settings.ts /path/to/.env

const envPath = process.argv[2];

if (!envPath) {
  console.error('Environment file path is required as argument');
  console.error(
    'Usage: npx tsx tools/scripts/seed-cash-tracker-settings.ts /path/to/.env'
  );
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

async function initializePrismaClient(envPath: string) {
  const envVariables = await readEnvFile(envPath);
  const databaseUrl = envVariables.get('DATABASE_URL');

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in the .env file');
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  return prisma;
}

async function seedCashTrackerSettings(prisma: PrismaClient) {
  console.log('🌱 Seeding Cash Tracker Settings...');

  const cashTrackerSettings = [
    {
      name: 'ENTITIES',
      value: [
        {
          alias: 'Alice',
          address: '0xC52e90DB78DeB581D6CB8b5aEBda0802bA8F37B5',
          privateKey:
            '5fbfba72d025d3ab62849a654b5d90f7839af854f7566fc0317251e6becc17ac',
          smartAccount: '0xE17Fa0F009d2A3EaC3C2994D7933eD759CbCe257',
        },
        {
          alias: 'Bob',
          address: '0x7131EDcF4500521cB6B55C0658b2d83589946f44',
          privateKey:
            '51812b53380becea3bd28994d28151adb36b7ce04fb777826497d9fc5e88574b',
          smartAccount: '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B',
        },
        {
          alias: 'Charlie',
          address: '0xCc85BeEE78Cc66C03Dc6aa70080d66c85DCB308D',
          privateKey:
            '7d3eec01a82e7880cb3506377a94f3fd9f232793a094a6a361a8788b6603c6d4',
          smartAccount: '0xe5159f997F32D04F9276567bb2ED4CC0CdC9D8E4',
        },
      ],
      dataType: SettingDataType.OBJECT,
      requiredFields: [],
      isReadOnly: false,
      isPrivate: false,
    },
    {
      name: 'CASH_TOKEN_CONTRACT',
      value: '0xc3E3282048cB2F67b8e08447e95c37f181E00133',
      dataType: SettingDataType.STRING,
      requiredFields: [],
      isReadOnly: false,
      isPrivate: false,
    },
    {
      name: 'ENTRY_POINT',
      value: '0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b',
      dataType: SettingDataType.STRING,
      requiredFields: [],
      isReadOnly: false,
      isPrivate: false,
    },
    {
      name: 'CHAIN_SETTINGS',
      value: {
        rpcUrl: 'https://sepolia.base.org',
        chainId: 84532,
        network: 'base-sepolia',
      },
      dataType: SettingDataType.OBJECT,
      requiredFields: [],
      isReadOnly: false,
      isPrivate: false,
    },
  ];

  for (const setting of cashTrackerSettings) {
    try {
      // Check if setting already exists
      const existingSetting = await prisma.setting.findUnique({
        where: { name: setting.name },
      });

      if (existingSetting) {
        console.log(
          `⚠️  Setting '${setting.name}' already exists. Updating...`
        );
        await prisma.setting.update({
          where: { name: setting.name },
          data: {
            value: setting.value,
            dataType: setting.dataType,
            requiredFields: setting.requiredFields,
            isReadOnly: setting.isReadOnly,
            isPrivate: setting.isPrivate,
          },
        });
        console.log(`✅ Updated setting '${setting.name}'`);
      } else {
        await prisma.setting.create({
          data: setting,
        });
        console.log(`✅ Created setting '${setting.name}'`);
      }
    } catch (error) {
      console.error(`❌ Error processing setting '${setting.name}':`, error);
      throw error;
    }
  }

  console.log('🎉 Cash Tracker Settings seeded successfully!');
}

async function main() {
  let prisma: PrismaClient | undefined;

  try {
    console.log('🚀 Starting Cash Tracker Settings Seeding...');

    // Validate environment file path
    await validateEnvPath();
    console.log(`✅ Environment file validated: ${envPath}`);

    // Initialize Prisma client
    prisma = await initializePrismaClient(envPath);
    console.log('✅ Prisma client initialized');

    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection established');

    // Seed cash tracker settings
    await seedCashTrackerSettings(prisma);

    console.log('🎉 All operations completed successfully!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    // Close Prisma connection
    if (prisma) {
      await prisma.$disconnect();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
