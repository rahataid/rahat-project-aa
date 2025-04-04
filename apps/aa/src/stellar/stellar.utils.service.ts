import { Injectable, Logger } from '@nestjs/common';
import { TriggersService } from '../triggers/triggers.service';
import { BeneficiaryCSVData } from '../triggers/dto/beneficiaryCSVData.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StellarUtilsService {
  constructor(private configService: ConfigService) {}

  async generateCSV(benData: BeneficiaryCSVData[]): Promise<Buffer> {
    const header = 'phone,id,amount,verification,paymentID\n';
    const verificationNumber = this.configService.get('SDP_VERIFICATION_PIN');

    const rows = benData
      .map((beneficiary) => {
        const reciverId = `RECEIVER_${beneficiary.id}`;
        const paymentId = `PAY_${beneficiary.id}`;
        const phone = beneficiary.phone.replace(/"/g, '""');
        const id = reciverId.replace(/"/g, '""');
        const amount = beneficiary.amount.replace(/"/g, '""');
        const verification = verificationNumber.replace(/"/g, '""');
        const paymentID = paymentId.replace(/"/g, '""');

        return `"${phone}","${id}","${amount}","${verification}","${paymentID}"`;
      })
      .join('\n');

    const csvFile = header + rows;

    return Buffer.from(csvFile, 'utf8');
  }
}
