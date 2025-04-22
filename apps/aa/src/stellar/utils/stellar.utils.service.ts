import { BeneficiaryCSVData } from '../../triggers/dto/beneficiaryCSVData.dto';

export const generateCSV = async (
  benData: BeneficiaryCSVData[]
): Promise<Buffer> => {
  const header = 'phone,walletAddress,walletAddressMemo,id,amount,paymentID\n';

  const rows = benData
    .map((beneficiary) => {
      const phone = `+977${beneficiary.phone.replace(/"/g, '""')}`;
      const amount = parseFloat(beneficiary.amount);
      if (isNaN(amount) || amount <= 1) {
        throw new Error(
          `Invalid amount for beneficiary ${beneficiary.id}: must be greater than 1`
        );
      }

      const randomNumber = Math.floor(Math.random() * 100000);
      const reciverId = `RECEIVER_${beneficiary.id}`;
      const paymentId = `PAY_${beneficiary.id}_${randomNumber}`;
      const id = reciverId.replace(/"/g, '""');
      const formattedAmount = beneficiary.amount.replace(/"/g, '""');
      const paymentID = paymentId.replace(/"/g, '""');
      const walletAddress = beneficiary.walletAddress.replace(/"/g, '""');

      return `"${phone}","${walletAddress}","${beneficiary.phone}","${id}","${formattedAmount}","${paymentID}"`;
    })
    .join('\n');

  const csvFile = header + rows;

  return Buffer.from(csvFile, 'utf8');
};
