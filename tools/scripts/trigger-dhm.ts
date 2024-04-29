import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import { sendEmail } from '../email'

const prisma = new PrismaClient();
const d = './dhm-data.json'

const main = async () => {
    const dhmSource = await prisma.dataSources.findFirst({
        where: {
            dataSource: 'DHM',
            isActive: true
        }
    })

    const dhmId = dhmSource?.uuid
    const triggerData = JSON.parse(await fs.readFile(d, 'utf-8'));


    for (const td of triggerData) {
        await prisma.sourceData.create({
            data: {
                data: td,
                dataSourceId: dhmId,
                createdAt: td.createdOn
            }
        })
    }

    await prisma.dataSources.update({
        where: {
           uuid: dhmId
        },
        data: {
            readinessActivated: true,
            readinessActivatedOn: triggerData[0].createdOn
        }
    })

    await sendEmail('avash700@gmail.com', "WARNING", "Water level has reached warning level.", "<p>Water level has reached warning level.<p>")
    
    console.log("Trigger data updated")
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });