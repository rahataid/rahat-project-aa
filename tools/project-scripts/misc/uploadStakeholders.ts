import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import axios from 'axios';

const google_cred = require(`../../config/google.json`);

type ApiAuth = {
    url: string;
    accessToken: string;
};

const serviceAccountAuth = new JWT({
    email: google_cred.client_email,
    key: google_cred.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

console.log(google_cred.client_email)

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


const addStakeholders = async (config: ApiAuth, activity: any): Promise<void> => {
    const addStakeholderPayload = {
        "action": "aaProject.stakeholders.add",
        "payload": activity
    }
    const response = await axios.post(config.url, addStakeholderPayload, {
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
        },
    });
    console.log(response.data);
}

// //Rahat Demo Training
const sheetId = '1CQjNvvEpjx9VXzUffm5UwnrWSVjpKhlhmm0snmqCm7k';
const sheetName = 'stakeholders_list';
const accessToken = ''
const baseUrl = 'https://api.drc.aa.np.rahat.io/v1';
const projectActionUrl = (projectId: string): string => `${baseUrl}/projects/${projectId}/actions`;
const projectId = '39314b3b-de0c-4ada-ac87-7d4457be51a4';

(async () => {
    const apiConfig = {
        url: projectActionUrl(projectId),
        accessToken
    }
    const stakeholdersData = await getGoogleSheetsData(sheetId, sheetName);

    for (let stakeholder of stakeholdersData) {
        // await sleep(1000);
        const s = {
            name: stakeholder.get('Name'),
            email: stakeholder.get('Email'),
            phone: stakeholder.get('Mobile'),
            designation: stakeholder.get('Designation'),
            organization: stakeholder.get('Organization'),
            district: stakeholder.get('District'),
            municipality: stakeholder.get('Municipality')
        }
        if (!s.phone) continue;
        await addStakeholders(apiConfig, s);
    }

})();