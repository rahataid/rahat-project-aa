import { BeneficiaryCSVData } from '../../triggers/dto/beneficiaryCSVData.dto';

export const generateCSV = async (
  benData: BeneficiaryCSVData[],
  verificationNumber: string
): Promise<Buffer> => {
  const header = 'phone,id,amount,verification,paymentID\n';

  const randomNumber = Math.floor(Math.random() * 100000);

  const rows = benData
    .map((beneficiary) => {
      const reciverId = `RECEIVER_${beneficiary.id}`;
      const paymentId = `PAY_${beneficiary.id}_${randomNumber}`;
      const phone = `+977${beneficiary.phone.replace(/"/g, '""')}`;
      const id = reciverId.replace(/"/g, '""');
      const amount = beneficiary.amount.replace(/"/g, '""');
      const verification = verificationNumber.replace(/"/g, '""');
      const paymentID = paymentId.replace(/"/g, '""');

      return `"${phone}","${id}","${amount}","${verification}","${paymentID}"`;
    })
    .join('\n');

  const csvFile = header + rows;

  return Buffer.from(csvFile, 'utf8');
};
