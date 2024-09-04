import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { CommunicationService } from '@rumsan/communication/services/communication.client';
import { randomUUID } from 'crypto';

import { getClient } from "@rumsan/connect/src/clients"


// cm03kberr001nycs247bbo7bg

// const TRANSPORTS: { [key: string]: string } = {
//   SMS: 'nc6bzmkmd014706rfda898to',
//   IVR: 'bawy3j4i8doorst6hsxwurzf',
// };

// const communicationService = new CommunicationService({
//   baseURL: process.env.COMMUNICATION_URL,
//   headers: {
//     appId: process.env.COMMUNICATION_APP_ID,
//   },
// });

// {"URL": "http://localhost:3333/api/v1", "APP_ID": "clzwp5q7b0000459lzmmemvui"}

const client = getClient({
  baseURL: "http://localhost:3333/api/v1"
})
client.setAppId("clzwp5q7b0000459lzmmemvui")

const prisma = new PrismaClient();

const main = async () => {


  const d = fs.readFileSync(`${__dirname}/prod-data/tikapur/33.json`,'utf-8');
  const logsData = JSON.parse(d)
  console.log(logsData)

  
  
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });
