import { PrismaClient, Phase } from '@prisma/client';

const prisma = new PrismaClient();

let phaseIds: string[]
const phaseData = [
    {
        name: Phase.PREPAREDNESS
    },
    {
        name: Phase.READINESS
    },
    {
        name: Phase.ACTION
    }
]

let activityCategoriesId: string[]
const activityCategoriesData = [
    {
        name: 'General Action'
    },
    {
        name: 'Early Warning Communication'
    },
    {
        name: 'Cleaning The Drains'
    },
    {
        name: 'Managing Drinking Water'
    },
    {
        name: 'Cash Transfer'
    }
]


const main = async () => {
    // ***** seed phases ****
    for (const phase of phaseData) {
        const d = await prisma.phases.create({
            data: phase
        })
        phaseIds.push(d.uuid)
    }
    // ***** seed phases complete ***

    // ***** seed activity categories ****
    for (const category of activityCategoriesData) {
        const d = await prisma.activityCategories.create({
            data: category
        })
        activityCategoriesId.push(d.uuid)
    }
    // ***** seed activity categories ***

    console.log(phaseIds),
    console.log(activityCategoriesId)

}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.log(error);
        await prisma.$disconnect();
    });
