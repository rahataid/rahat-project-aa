import { PrismaClient, Phase } from '@prisma/client';

const prisma = new PrismaClient();

const hazardTypesData = [
    {
        uuid: "70387f36-8ff1-4ffd-8290-26320d8bfc21",
        name: 'River Flood'
    }
]

const phaseData = [
    {
        uuid: "d8717555-3a71-4d5a-8a0d-fec1be26ce3b",
        name: Phase.PREPAREDNESS
    },
    {
        uuid: "ecce09ad-2364-4e21-a59a-09b0f3a3fde5",
        name: Phase.READINESS
    },
    {
        uuid: "c7e69410-f71c-40c0-bd06-6bb95494fd82",
        name: Phase.ACTION
    }
]

const activityCategoriesData = [
    {
        uuid: '33c6ce0f-b6ef-4d07-9e08-1081c7906a58',
        name: 'General Action'
    },
    {
        uuid: '81081d98-ad52-4dff-b324-2aa597142488',
        name: 'Early Warning Communication'
    },
    {
        uuid: '0a824dad-360f-4c43-af86-c110f81a019a',
        name: 'Cleaning The Drains'
    },
    {
        uuid: '7cf2aed6-cfe9-45bb-a12f-4b138e7911bf',
        name: 'Managing Drinking Water'
    },
    {
        uuid: '6a680e6e-1f45-4619-a398-0ca127dec00e',
        name: 'Cash Transfer'
    }
]

const activities: Array<{
    title: string,
    phaseId: string,
    categoryId: string,
    responsibility: string,
    hazardTypesId: string,
    source: string,
    description: string
}> = [
        // preparedness action activities, general action
        {
            title: 'Preparedness activity one.',
            description: 'this is description of activity',
            responsibility: 'Member Secretary - Local DMC',
            source: 'Municipality',
            phaseId: 'd8717555-3a71-4d5a-8a0d-fec1be26ce3b',
            categoryId: '33c6ce0f-b6ef-4d07-9e08-1081c7906a58',
            hazardTypesId: '70387f36-8ff1-4ffd-8290-26320d8bfc21'
        },
        {
            title: 'Preparedness activity two.',
            description: 'this is description of activity',
            responsibility: 'Member Secretary - Local DMC',
            source: 'Municipality',
            phaseId: 'd8717555-3a71-4d5a-8a0d-fec1be26ce3b',
            categoryId: '81081d98-ad52-4dff-b324-2aa597142488',
            hazardTypesId: '70387f36-8ff1-4ffd-8290-26320d8bfc21'
        },
        {
            title: 'Readiness activity one.',
            description: 'this is description of activity',
            responsibility: 'Member Secretary - Local DMC',
            source: 'Municipality',
            phaseId: 'ecce09ad-2364-4e21-a59a-09b0f3a3fde5',
            categoryId: '7cf2aed6-cfe9-45bb-a12f-4b138e7911bf',
            hazardTypesId: '70387f36-8ff1-4ffd-8290-26320d8bfc21'
        },
        {
            title: 'Readiness activity two.',
            description: 'this is description of activity',
            responsibility: 'Member Secretary - Local DMC',
            source: 'Municipality',
            phaseId: 'ecce09ad-2364-4e21-a59a-09b0f3a3fde5',
            categoryId: '0a824dad-360f-4c43-af86-c110f81a019a',
            hazardTypesId: '70387f36-8ff1-4ffd-8290-26320d8bfc21'
        },
        {
            title: 'Action activity one.',
            description: 'this is description of activity',
            responsibility: 'Member Secretary - Local DMC',
            source: 'Municipality',
            phaseId: 'c7e69410-f71c-40c0-bd06-6bb95494fd82',
            categoryId: '7cf2aed6-cfe9-45bb-a12f-4b138e7911bf',
            hazardTypesId: '70387f36-8ff1-4ffd-8290-26320d8bfc21'
        },
        {
            title: 'Action activity two.',
            description: 'this is description of activity',
            responsibility: 'Member Secretary - Local DMC',
            source: 'Municipality',
            phaseId: 'c7e69410-f71c-40c0-bd06-6bb95494fd82',
            categoryId: '6a680e6e-1f45-4619-a398-0ca127dec00e',
            hazardTypesId: '70387f36-8ff1-4ffd-8290-26320d8bfc21'
        }
    ]


const main = async () => {
    // ***** seed hazard types ****
    for (const hazard of hazardTypesData) {
        await prisma.hazardTypes.create({
            data: hazard
        })
    }
    // ***** seed hazard types complete ***

    // ***** seed phases ****
    for (const phase of phaseData) {
        await prisma.phases.create({
            data: phase
        })
    }
    // ***** seed phases complete ***

    // ***** seed activity categories ****
    for (const category of activityCategoriesData) {
        await prisma.activityCategories.create({
            data: category
        })
    }
    // ***** seed activity categories ***

    // ***** seed activities ****
    for (const activity of activities) {
        await prisma.activities.create({
            data: activity
        })
    }
    // ***** seed activities complete ***

}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.log(error);
        await prisma.$disconnect();
    });
