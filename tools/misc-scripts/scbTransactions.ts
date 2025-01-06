import axios from 'axios';

const baseUrl = 'https://scb.np.rahat.io/v1';
const access_token = '62284a27-a8f8-4ba7-8f62-f3a9153551bc';

interface SCBTransactionData {
    txnDetails: string;
    txnAmount: string;
    createdAt: string;
    accountNumber: string;
    accountName: string;
}

interface ParsedTransaction {
    txId: string;
    accountNumber: string;
    accountName: string;
    currency: string;
    amount: string;
    date: string;
}

const fetchScbData = async (accountNumber: string) => {
    const response = await axios.get(`${baseUrl}/webhooks/query?accountNumber=${accountNumber}`, {
        headers: {
            'access_token': `${access_token}`
        }
    });
    return response.data;
}
const parseTransactionDetails = (transaction: SCBTransactionData): ParsedTransaction => {
    const details = transaction.txnDetails.split(', ');
    const amountParts = transaction.txnAmount.split(', ');
    const accountNumber = transaction.accountNumber;
    const accountName = transaction.accountName
    const currency = amountParts[0].split(':')[1].trim();
    const amount = amountParts[1].split(':')[1].trim();

    return {
        txId: details[1],
        accountNumber,
        accountName,
        currency: currency,
        amount: amount,
        date: new Date(transaction.createdAt).toLocaleDateString()
    };
}

const main = async (accountNumber: string) => {
    const scbData = await fetchScbData(`${accountNumber}`);
    const parsedTransactions: ParsedTransaction[] = scbData.data.map((transaction: SCBTransactionData) => parseTransactionDetails(transaction));


    console.log(parsedTransactions);
}


main('NP5BT241030A00J6');