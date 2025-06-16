import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import axios, { AxiosError } from 'axios';
const googleCreds = require("../config/google.json");

// Configurations - update these as needed
const BANK_VALIDATION_URL = "https://api-offramp-dev.rahat.io/v1/payment-provider/json-rpc";
const BEN_GSHEET_ID = "1JEy0-LCDKMPXzsCuO9WnXFyEk2sJLTylGAGGBKu-T2o";
const SHEET_NAME = "ben_list";

interface BankDetails {
  bankId: string;
  accountName: string;
  accountId: string;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const serviceAccountAuth = new JWT({
    email: googleCreds.client_email,
    key: googleCreds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

//find row and validate bank details
const updateBeneficiaryDetailsInSheet = async (sheetId: string, sheetName: string): Promise<void> => {
  try {
    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found.`);
    }
    const rows = await sheet.getRows();
    for (const row of rows) {
      const bankDetails: BankDetails = {
        bankId: row.get('Bank Name'),
        accountName: row.get('Account Name'),
        accountId: row.get('Bank A/c Number')
      };
      console.log("Validating bank details:", bankDetails);
      const validation = await validateBankDetails(bankDetails);
      console.log({validation});
      row.set('is_bank_valid', validation.data.isValid);
      await row.save();
      await sleep(1000);
    }
    console.log("Updating beneficiary details in sheet...");
  } catch (error) {
    console.error("Error updating beneficiary details:", error);
    throw error;
  }
};

const validateBankDetails = async (bankDetails: BankDetails): Promise<any> => {
  try {
    const response = await axios.post(BANK_VALIDATION_URL, {
      provider: "cips",
      method: "validateAccount",
      params: {
        bankId: bankDetails.bankId,
        accountName: bankDetails.accountName,
        accountId: bankDetails.accountId
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Bank validation error:', error.response?.data || error.message);
    } else {
      console.error('Bank validation error:', error);
    }
    throw error;
  }
};

const main = async (): Promise<void> => {
  if (!BEN_GSHEET_ID) {
    console.error("BEN_GSHEET_ID is not set in the environment variables.");
    return;
  }
  
  try {
    await updateBeneficiaryDetailsInSheet(BEN_GSHEET_ID, SHEET_NAME);
  } catch (error) {
    console.error("Error fetching beneficiary data:", error);
  }
};

main();