import { PrismaService } from "@rumsan/prisma"
import { PrismaClient } from '@prisma/client';
import { SettingsService } from "@rumsan/settings"

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

const main = async () => {
  const activeYear = process.env.ACTIVE_YEAR;
  const riverBasin = process.env.RIVER_BASIN;
  if(!activeYear || !riverBasin) {
    throw new Error("ACTIVE_YEAR and RIVER_BASIN environment variables are required");
  }

  try {
    const dataSource = await settings.getPublic('PROJECTINFO');

    if (dataSource) {
      console.log('PROJECTINFO already exists');
      await settings.delete('PROJECTINFO');
      console.log('Old PROJECTINFO deleted');
    }
    await settings.create({
        name: 'PROJECTINFO',
        value: {
          "ACTIVE_YEAR": activeYear,
          "RIVER_BASIN": riverBasin,
        },
        isPrivate: false
    })

  } catch (error) {
    await settings.create({
        name: 'PROJECTINFO',
        value: {
          "ACTIVE_YEAR": activeYear,
          "RIVER_BASIN": riverBasin,
        },
        isPrivate: false
    })

  }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.log(error);
        await prisma.$disconnect();
    });
