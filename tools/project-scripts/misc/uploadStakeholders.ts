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
const sheetName = 'employees';
const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcklkIjoxLCJ1dWlkIjoiZWZiYThlZDctNmYzYi00NGY0LTg0ZjgtMDVlYTg4YmUzMGM1IiwibmFtZSI6IlJ1bXNhbiBBZG1pbiIsImVtYWlsIjoicnVtc2FuQG1haWxpbmF0b3IuY29tIiwicGhvbmUiOm51bGwsIndhbGxldCI6IjB4NzVmNTk4ODc0REMzOUUzNjQ4NDZkNTc3Q0VkZTQ4ZDUwMzc4YUM0MCIsInJvbGVzIjpbIkFkbWluIl0sInBlcm1pc3Npb25zIjpbeyJhY3Rpb24iOiJtYW5hZ2UiLCJzdWJqZWN0IjoiYWxsIiwiaW52ZXJ0ZWQiOmZhbHNlLCJjb25kaXRpb25zIjpudWxsfV0sImlhdCI6MTcyMzgwMTkzOCwiZXhwIjoxNzIzODg4MzM4fQ.ZtJgaqWd2-_Kx0W9QBmgixLAzmdrURp9Fa_Dyvfgee4'
const baseUrl = 'http://localhost:5500/v1';
const projectActionUrl = (projectId: string): string => `${baseUrl}/projects/${projectId}/actions`;
const projectId = 'dd4b0d22-e83a-48d9-ba64-94d148f101ce';

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
        // console.log(stakeholder.get('Name'),stakeholder.get('Mobile'))
        await addStakeholders(apiConfig, s);
    }

})();