import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { CommunicationService } from '@rumsan/communication/services/communication.client';

const communicationService = new CommunicationService({
    baseURL: process.env.COMMUNICATION_URL,
    headers: {
      appId: process.env.COMMUNICATION_APP_ID
    },
  });

const prisma = new PrismaClient();

const main = async () => {

    console.log(__dirname)

    const activitiesWithCommunication = await prisma.activities.findMany({
        where: {
            activityCommunication: {
                not: []
            }
        }
    })


    const ongoingActivities: any[] = []
    const completedActivity: any[] = []

    for (const activity of activitiesWithCommunication){
        console.log("======activity start=====")

        for(const comm of JSON.parse(JSON.stringify(activity.activityCommunication))){
            const campaignDetails = await communicationService.communication.getCampaign(comm.campaignId)
            if(campaignDetails.data?.status !== "ONGOING"){
                completedActivity.push({
                    activityId: activity.uuid,
                    campaignId: comm.campaignId
                })
                console.log("activity completed")
            }else{
                ongoingActivities.push({
                    activityId: activity.uuid,
                    campaignId: comm.campaignId
                })
                console.log("activity ongoing")

            }
        }

        console.log("======activity end=====")
    }

  fs.writeFileSync(`${__dirname}/prod-data/tikapur/ongoing.json`,JSON.stringify(ongoingActivities,null,4));
  fs.writeFileSync(`${__dirname}/prod-data/tikapur/completed.json`,JSON.stringify(completedActivity,null,4));

};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.log(error);
    await prisma.$disconnect();
  });
