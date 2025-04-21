import { BeneficiaryCSVData } from '../../triggers/dto/beneficiaryCSVData.dto';

export const generateCSV = async (
  benData: BeneficiaryCSVData[],
  verificationNumber: string
): Promise<Buffer> => {
  const header = 'phone,walletAddress,walletAddressMemo,id,amount,paymentID\n';

  console.log(benData);
  const rows = benData
    .map((beneficiary) => {
      const randomNumber = Math.floor(Math.random() * 100000);
      const reciverId = `RECEIVER_${beneficiary.id}`;
      const paymentId = `PAY_${beneficiary.id}_${randomNumber}`;
      const phone = `+977${beneficiary.phone.replace(/"/g, '""')}`;
      const id = reciverId.replace(/"/g, '""');
      const amount = beneficiary.amount.replace(/"/g, '""');
      const paymentID = paymentId.replace(/"/g, '""');

      const walletAddress = beneficiary.walletAddress.replace(/"/g, '""');

      return `"${phone}","${walletAddress}","${beneficiary.phone}","${id}","${amount}","${paymentID}"`;
    })
    .join('\n');

  const csvFile = header + rows;

  console.log(csvFile);

  return Buffer.from(csvFile, 'utf8');
};
