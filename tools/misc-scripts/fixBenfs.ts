import { PrismaService } from '@rumsan/prisma';
import { log } from 'console';
import * as dotenv from 'dotenv';
dotenv.config();
import { JsonRpcProvider, ethers } from 'ethers';
import * as fs from 'fs'

const prisma = new PrismaService();


const main = async () => {

  const benfs = await prisma.beneficiary.findMany({
    
  })

  // // console.log(benfs.length)

  // const removeIds = benfs.map((b) => b.uuid)

  // fs.writeFileSync("removeids.json", JSON.stringify(removeIds,null,4))

  // await prisma.beneficiary.deleteMany({
  //   where: {
  //     uuid: {
  //       in: removeIds
  //     }
  //   }
  // })
console.log(benfs.length)
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
