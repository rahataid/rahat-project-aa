import axios from "axios";
import * as fs from 'fs';
import { Readable } from "stream";

// This is a temporary file to generate csv for test and will be deleted

export const create_disbursement_csv = async () => {
    const beneficiaries_pii = await axios.post('https://api.nx.dev.rahat.io/v1/projects/bc05fe4d-ffbb-468c-9681-f6c3259deeb4/actions', 
        {
            "action": "beneficiary.list_by_project",
            "payload": {}
        },
        {
            headers: {
                Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcklkIjoxLCJ1dWlkIjoiMjZlOTJiNTgtNzJmMS00NTU3LTk5ZTItOTIzY2IwNzhmYzY5IiwibmFtZSI6IlJ1bXNhbiBBZG1pbiIsImVtYWlsIjoicnVtc2FuQG1haWxpbmF0b3IuY29tIiwicGhvbmUiOm51bGwsIndhbGxldCI6IjB4NzVmNTk4ODc0REMzOUUzNjQ4NDZkNTc3Q0VkZTQ4ZDUwMzc4YUM0MCIsInJvbGVzIjpbIkFkbWluIl0sInBlcm1pc3Npb25zIjpbeyJhY3Rpb24iOiJtYW5hZ2UiLCJzdWJqZWN0IjoiYWxsIiwiaW52ZXJ0ZWQiOmZhbHNlLCJjb25kaXRpb25zIjpudWxsfV0sImlhdCI6MTcyNTg3ODQyOSwiZXhwIjoxNzI2NDgzMjI5fQ.P71yvZXQkd4MEAz9lfEH3FGbbqUVQwsMx7JBgoJrTok'
            }
        }
    );

    const beneficiaries_phone = beneficiaries_pii.data.data.map((ben: any) => {return { phone: ben.piiData.phone, walletAddress: ben.walletAddress}})

    const beneficiary_infos = await axios.post('https://api.nx.dev.rahat.io/v1/projects/bc05fe4d-ffbb-468c-9681-f6c3259deeb4/actions', {
        "action": "rpProject.disbursements.get",
        "payload": {}
    },
    {
        headers: {
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcklkIjoxLCJ1dWlkIjoiMjZlOTJiNTgtNzJmMS00NTU3LTk5ZTItOTIzY2IwNzhmYzY5IiwibmFtZSI6IlJ1bXNhbiBBZG1pbiIsImVtYWlsIjoicnVtc2FuQG1haWxpbmF0b3IuY29tIiwicGhvbmUiOm51bGwsIndhbGxldCI6IjB4NzVmNTk4ODc0REMzOUUzNjQ4NDZkNTc3Q0VkZTQ4ZDUwMzc4YUM0MCIsInJvbGVzIjpbIkFkbWluIl0sInBlcm1pc3Npb25zIjpbeyJhY3Rpb24iOiJtYW5hZ2UiLCJzdWJqZWN0IjoiYWxsIiwiaW52ZXJ0ZWQiOmZhbHNlLCJjb25kaXRpb25zIjpudWxsfV0sImlhdCI6MTcyNTg3ODQyOSwiZXhwIjoxNzI2NDgzMjI5fQ.P71yvZXQkd4MEAz9lfEH3FGbbqUVQwsMx7JBgoJrTok'
        }
    })

    const beneficiary_amounts = beneficiary_infos.data.data.map((ben: any) => {return {walletAddress: ben.Beneficiary.walletAddress, amount: ben.amount}} )

    const result = beneficiaries_phone.map((phoneEntry: any) => {
        const matchedAmount = beneficiary_amounts.find((amountEntry: any) => amountEntry.walletAddress.toLowerCase() === phoneEntry.walletAddress.toLowerCase());
        
        return matchedAmount ? { phone: phoneEntry.phone, amount: matchedAmount.amount } : null;
      }).filter(Boolean);

      console.log(result)

    const csvContent = [
        ['phone', 'id', 'amount', 'paymentID', 'verification'],
        ...result.map((row: any, index: number) => [`${row.phone}`, `RECEIVER_0${index}`, row.amount, `PAY_0${index}`, `1111`])
    ].map(e => e.join(',')).join('\n');


    // fs.writeFile('phone_amount_data.csv', csvContent, 'utf8', (err) => {
    //     if (err) {
    //       console.error('Error writing CSV file:', err);
    //     } else {
    //       console.log('CSV file has been saved successfully.');
    //     }
    //   });

    const csvStream = new Readable();
    csvStream.push(csvContent);  // Push the CSV content into the stream
    csvStream.push(null);

    return csvStream;
}

create_disbursement_csv();