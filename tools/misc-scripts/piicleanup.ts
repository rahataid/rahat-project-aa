import { PrismaClient } from '@prisma/client';
import fs from "fs"


const prisma = new PrismaClient();

const main = async () => {
    const noPii = fs.readFileSync(`${__dirname}/nopii.json`, "utf-8");
    const parsedData = JSON.parse(noPii)

    let addresses: string[] = []

    for (const d of parsedData){
        addresses.push(d?.walletAddress)
    }

    fs.writeFileSync(`${__dirname}/address.json`,JSON.stringify(addresses,null,4));
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.log(error);
        await prisma.$disconnect();
    });
