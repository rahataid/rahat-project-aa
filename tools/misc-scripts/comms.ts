import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

const prisma = new PrismaClient();

const main = async () => {
  const communicationService = new CommunicationService({
    baseURL: process.env.COMMUNICATION_URL,
    headers: {
      appId: process.env.COMMUNICATION_APP_ID
    },
  });

  const logs = await communicationService.communication.getCampaign(35)
  fs.writeFileSync(`${__dirname}/34-logs.json`,JSON.stringify(logs.data.communicationLogs,null,4));

};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });
