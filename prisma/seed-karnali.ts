import { PrismaService } from "@rumsan/prisma"
import { PrismaClient } from '@prisma/client';
import { SettingsService } from "@rumsan/settings"

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

const main = async () => {
    // ***** seed settings start ***
    await settings.create({
        name: 'DATASOURCE',
        value: {
            DHM: {
                location: 'Karnali at Chisapani',
                url: 'https://bipadportal.gov.np/api/v1'
            },
            GLOFAS: {
                location: 'Karnali at Chisapani',
                url: "https://ows.globalfloods.eu/glofas-ows/ows.py",
                bbox: "8753364.64714296,3117815.425733483,9092541.220653716,3456991.999244238", //bounding box for karnali at chisapani
                i: "721", //coordinate for station
                j: "303"
            }
        },
        isPrivate: false
    })
    // ***** seed settings complete ***
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.log(error);
        await prisma.$disconnect();
    });
