import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import axios from 'axios';

const google_cred = require(`../../config/google.json`);

type ApiAuth = {
    url: string;
    accessToken: string;
};
type NameIds = {
    uuid: string;
    name: string;
};

type Activity = {
    title: string;
    leadTime: string;
    phaseId: string;
    categoryId: string;
    responsibility: string;
    source: string;
    description: string;
    isAutomated: boolean;
};


const serviceAccountAuth = new JWT({
    email: google_cred.client_email,
    key: google_cred.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getGoogleSheetsData = async (
    sheetId: string,
    sheetName: string
): Promise<GoogleSpreadsheetRow<Record<string, any>>[]> => {
    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    const rows = await sheet.getRows();
    return rows;
};

const getPhaseIds = async (config: ApiAuth): Promise<NameIds[]> => {
    const getPhasePayload = {
        "action": "aaProject.phases.getAll",
        "payload": {}
    }
    const response = await axios.post(config.url, getPhasePayload, {
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
        },
    });
    const { data } = response.data;
    const phases = data.map((phase: any) => ({
        uuid: phase.uuid,
        name: phase.name,
    }));
    return phases;
}

const getCategoryIds = async (config: ApiAuth): Promise<NameIds[]> => {
    const getCategoryPayload = {
        "action": "aaProject.activityCategories.getAll",
        "payload": {}
    }
    const response = await axios.post(config.url, getCategoryPayload, {
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
        },
    });
    const { data } = response.data;
    const categories = data.map((category: any) => ({
        uuid: category.uuid,
        name: category.name,
    }));
    return categories;
}

const addActivity = async (config: ApiAuth, activity: Activity): Promise<void> => {
    const addActivityPayload = {
        "action": "aaProject.activities.add",
        "payload": activity
    }
    const response = await axios.post(config.url, addActivityPayload, {
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
        },
    });
    console.log(response.data);
}

const updateIdInGSheet = async (
    sheetId: string,
    sheetName: string,
    apiConfig: ApiAuth
): Promise<void> => {
    const rows = await getGoogleSheetsData(sheetId, sheetName);
    const phaseIds = await getPhaseIds(apiConfig);
    const categoryIds = await getCategoryIds(apiConfig);
    for (let row of rows) {
        await sleep(1000);
        if (!row.get('phase') && !row.get('category')) continue;
        if (row.get('phase')) {
            const phaseId = phaseIds.find((phase) => phase.name === row.get('phase'))?.uuid;
            row.set('phaseId', phaseId);
        }
        if (row.get('category')) {
            const categoryId = categoryIds.find((category) => category.name === row.get('category'))?.uuid;
            row.set('categoryId', categoryId);
        }
        console.log({ row });
        await row.save();
    }
}


// //Rahat Staging
// const sheetId = '1sMLv7S_WgpQgbX_HHqeA6ZRyt5K-W-xdT2oZSsDAKmY';
// const sheetName = 'activities';
// const accessToken = '';
// const baseUrl = 'https://api.aa.xs.rahat.io/v1';
// const projectActionUrl = (projectId: string): string => `${baseUrl}/projects/${projectId}/actions`;
// const projectId = '369e043e-bc2e-42e5-9222-e2f9ac29962a';

// //Rahat Demo Training
// const sheetId = '1sMLv7S_WgpQgbX_HHqeA6ZRyt5K-W-xdT2oZSsDAKmY';
// const sheetName = 'activities';
// const accessToken = ''
// const baseUrl = 'https://api.aa-rumsan.drc.np.rahat.io/v1';
// const projectActionUrl = (projectId: string): string => `${baseUrl}/projects/${projectId}/actions`;
// const projectId = '4c51c884-6c84-41fe-a4b9-149c70e667f2';

//Rahat Demo unicef
const sheetId = '1sMLv7S_WgpQgbX_HHqeA6ZRyt5K-W-xdT2oZSsDAKmY';
const sheetName = 'activities';
const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcklkIjoxLCJ1dWlkIjoiM2FhNjZmNGEtNWEzMi00ZmNiLWE5MDMtZWUwMmUyNDc0YzI1IiwibmFtZSI6IlJ1bXNhbiBBZG1pbiIsImVtYWlsIjoicnVtc2FuQG1haWxpbmF0b3IuY29tIiwicGhvbmUiOm51bGwsIndhbGxldCI6IjB4NzVmNTk4ODc0REMzOUUzNjQ4NDZkNTc3Q0VkZTQ4ZDUwMzc4YUM0MCIsInJvbGVzIjpbIkFkbWluIl0sInBlcm1pc3Npb25zIjpbeyJhY3Rpb24iOiJtYW5hZ2UiLCJzdWJqZWN0IjoiYWxsIiwiaW52ZXJ0ZWQiOmZhbHNlLCJjb25kaXRpb25zIjpudWxsfV0sImlhdCI6MTcyNjgyMzQ4NywiZXhwIjoxNzI3NDI4Mjg3fQ.xmJK0B1YiwlufTHwsdXJ9Ed6gdhZdmncDd9R29pB7eE'
const baseUrl = 'https://api.aa.demo.rahat.io/v1';
const projectActionUrl = (projectId: string): string => `${baseUrl}/projects/${projectId}/actions`;
const projectId = '481b8630-7520-45aa-8ad9-3b82793cff28';

(async () => {
    const apiConfig = {
        url: projectActionUrl(projectId),
        accessToken
    }
    //await updateIdInGSheet(sheetId, sheetName, apiConfig);
    const activitiesData = await getGoogleSheetsData(sheetId, sheetName);
    for (let activity of activitiesData) {
        await sleep(1000);
        const activityData: Activity = {
            title: activity.get('activityTitle'),
            leadTime: activity.get('leadTime'),
            phaseId: activity.get('phaseId'),
            categoryId: activity.get('categoryId'),
            responsibility: activity.get('responsible'),
            source: activity.get('responsibleStation'),
            description: activity.get('remarks') || "remarks",
            isAutomated: activity.get('activityType') === 'Automatic' ? true : false
        }
        console.log({ activityData })
        if (!activityData.title) continue;
        await addActivity(apiConfig, activityData);
    }

})();