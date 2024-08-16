import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';

const prisma = new PrismaClient({
    datasourceUrl: process.env.CORE_DATABASE_URL as string
});

const projectPrisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL as string
})

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

    await modifyEnvAndSettings(uuid, prvKey)

}

async function modifyEnvAndSettings(uuid: string, prvKey: string) {
    try {
        let data = await fs.readFile(rootEnv, 'utf8');
        const lines = data.split('\n') as string[];

        const newLines = lines.map(line => {
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
                dataType: "STRING",
                isPrivate: true
            }
        })

        await projectPrisma.setting.create({
            data: {
                name: 'RAHAT_ADMIN_PRIVATE_KEY',
                value: prvKey,
                dataType: "STRING",
                isPrivate: true
            }
        })

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