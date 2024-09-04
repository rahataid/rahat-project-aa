import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { CommunicationService } from '@rumsan/communication/services/communication.client';
import { randomUUID } from 'crypto';

// cm03kberr001nycs247bbo7bg

const TRANSPORTS: { [key: string]: string } = {
  SMS: 'nc6bzmkmd014706rfda898to',
  IVR: 'bawy3j4i8doorst6hsxwurzf',
};

const communicationService = new CommunicationService({
  baseURL: process.env.COMMUNICATION_URL,
  headers: {
    appId: process.env.COMMUNICATION_APP_ID,
  },
});

const prisma = new PrismaClient();

const main = async () => {
  const d = fs.readFileSync(
    `${__dirname}/prod-data/tikapur/ongoing.json`,
    'utf-8'
  );
  const commsData = JSON.parse(d);

  for (const c of commsData) {

    const activityData = await prisma.activities.findUnique({
      where: {
        uuid: c.activityId,
      },
    });

    const updatedComms: any[] = [];

    for (const d of JSON.parse(
      JSON.stringify(activityData?.activityCommunication)
    )) {
      const campaignDetails =
        await communicationService.communication.getCampaign(d.campaignId);

      if (campaignDetails.data.status === 'ONGOING') {
        const { campaignId, communicationType, ...rest } = d;
        const transportId = TRANSPORTS[campaignDetails.data.transport.name];
        const communicationId = randomUUID();

        updatedComms.push({
          ...rest,
          transportId,
          communicationId,
        });
      }
    }

    console.log("updating activity with id", activityData?.uuid , "and data", updatedComms)

    const update = await prisma.activities.update({
      where: {
        uuid: activityData?.uuid
      },
      data: {
        activityCommunication: updatedComms
      }
    })

    console.log("updated", update)

  }
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });
