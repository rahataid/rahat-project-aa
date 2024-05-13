import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv'
import { sendRequest } from '../axios';
dotenv.config()

const prisma = new PrismaClient();
const d = './dhm-activation-data.json'
const commsURL = process.env.COMMS

const main = async () => {

    // await sendRequest(`${commsURL}/campaigns/trigger-all`)

    const dhmSource = await prisma.triggers.findFirst({
        where: {
            dataSource: 'DHM',
            isActive: true
        }
    })

    const dhmId = dhmSource?.uuid
    const triggerData = JSON.parse(await fs.readFile(d, 'utf-8'));


    for (const td of triggerData) {
        await prisma.triggersData.create({
            data: {
                data: td,
                triggerId: dhmId,
                createdAt: td.createdOn
            }
        })
    }

    await prisma.triggers.update({
        where: {
           uuid: dhmId
        },
        data: {
            activationActivated: true,
            activationActivatedOn: triggerData[0].createdOn
        }
    })

    console.log("Activation data updated")
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });