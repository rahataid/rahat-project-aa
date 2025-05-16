import { RpcException } from '@nestjs/microservices';
import { BeneficiaryCSVData } from '../../triggers/dto/beneficiaryCSVData.dto';
import * as crypto from 'crypto';

export const generateCSV = async (
  benData: BeneficiaryCSVData[]
): Promise<Buffer> => {
  try {
    const header =
      'phone,walletAddress,walletAddressMemo,id,amount,paymentID\n';

    const rows = benData
      .map((beneficiary) => {
        const phone = `${beneficiary.phone.replace(/"/g, '""')}`;
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

        return `"${phone}","${walletAddress}","${
          beneficiary.phone
        }","${id}","${formattedAmount.toString()}","${paymentID}"`;
      })
      .join('\n');

    const csvFile = header + rows;

    console.log(csvFile);

    return Buffer.from(csvFile, 'utf8');
  } catch (error) {
    throw new RpcException(
      error.message || 'Something went wrong while generating CSV'
    );
  }
};

export const generateParamsHash = (params) => {
  const SALT = 'hash_salt';
  const sortedParams = {};
  Object.keys(params)
    .sort()
    .forEach((key) => {
      sortedParams[key] = params[key];
    });
  const serialized = JSON.stringify(sortedParams);
  const dataToHash = `${SALT}:${serialized}`;
  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
  return hash;
};
