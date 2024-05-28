import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';

const prisma = new PrismaClient({
    datasourceUrl: process.env.CORE_DATABASE_URL as string
});

const rootPath = process.argv[2]
const rootEnv = `${rootPath}/.env`

async function main() {
    const uuid = randomUUID()

    await prisma.$executeRaw(
        Prisma.sql`
        INSERT INTO tbl_projects (uuid, name, description, status, type)
        VALUES (${uuid}::uuid, 'AA', 'AA Project', 'ACTIVE', 'AA')`
    )

    console.log('Project created successfully.');

    const [devSettings] = await prisma.$queryRaw<any[]>(
        Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='AA_DEV'`])
    )

    const prvKey = devSettings.value.privateKey

    await modifyEnv(uuid, prvKey)

}

async function modifyEnv(uuid: string, prvKey: string) {
    try {
        let data = await fs.readFile(rootEnv, 'utf8');
        const lines = data.split('\n') as string[];

        const newLines = lines.map(line => {
            if (line.startsWith('PROJECT_ID')) {
                return `PROJECT_ID=${uuid}`;
            }
            if (line.startsWith('RAHAT_ADMIN_PRIVATE_KEY')) {
                return `RAHAT_ADMIN_PRIVATE_KEY=${prvKey}`;
            }
            if (line.startsWith('DEPLOYER_PRIVATE_KEY')) {
                return `DEPLOYER_PRIVATE_KEY=${prvKey}`;
            }
            if (line.startsWith('OTP_SERVER_PRIVATE_KEY')) {
                return `OTP_SERVER_PRIVATE_KEY=${prvKey}`;
            }
            return line;
        });

        const newData = newLines.join('\n');

        await fs.writeFile(rootEnv, newData, 'utf8');

        console.log(rootEnv)
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