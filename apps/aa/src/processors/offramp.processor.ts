import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import { OfframpService } from '../payouts/offramp.service';
import { FSPOfframpDetails } from './types';

// {
//   "tokenAmount": 1,
//   "paymentProviderId": "0c1d24fc-aba5-40a2-a7ab-75f9ddc3611e",
// "transactionHash":"8fb9fa59a12ca6c39ca4800735fab46102ccf9c9983d1474409f73a0a5094156", 
//   "senderAddress": "b4d19024c749d16de416dd108a6d727f571cba6f826cb551a48bfcecc2b7f3b5",
//    "paymentDetails": {
//         "creditorAgent":1901,
//         "endToEndId":"Payment Description",
//         "creditorBranch":"506",
//         "creditorAccount":"09107010092348",
//         "creditorName":"Pratiksha Rai"
//   }
// }

@Processor(BQUEUE.OFFRAMP)
@Injectable()
export class OfframpProcessor {
  private readonly logger = new Logger(OfframpProcessor.name);

  constructor(
    private readonly settingService: SettingsService,
    private readonly prismaService: PrismaService,
     private readonly offrampService: OfframpService,
    @InjectQueue(BQUEUE.OFFRAMP)
    private readonly offrampQueue: Queue
  ) {}

  @Process({ name: JOBS.OFFRAMP.INSTANT_OFFRAMP, concurrency: 1 })
  async sendInstantOfframpRequest(job: Job<FSPOfframpDetails>) {

    this.logger.log(
      'Processing offramp request...',
      OfframpProcessor.name
    );
    
    try {
      const fspOfframpDetails = job.data;
      this.logger.log(`Initiating instant offramp with payload: ${JSON.stringify(fspOfframpDetails)}`);
      const offrampRequest = {
        tokenAmount: fspOfframpDetails.amount,
        paymentProviderId: fspOfframpDetails.payoutProcessorId,
        transactionHash: fspOfframpDetails.transactionHash,
        senderAddress: fspOfframpDetails.beneficiaryWalletAddress,
        paymentDetails: {
          creditorAgent: Number(fspOfframpDetails.beneficiaryBankDetails.bankName),
          endToEndId: "Payment Description",
          creditorBranch: '506',
          creditorAccount: fspOfframpDetails.beneficiaryBankDetails.accountNumber,
          creditorName: fspOfframpDetails.beneficiaryBankDetails.accountName
        }
        };

    console.log('offrampRequest', offrampRequest);
    this.logger.log(`Offramp request payload: ${JSON.stringify(offrampRequest)}`);
     const result = await this.offrampService.instantOfframp(offrampRequest);
     console.log('result', result);
      
      // update the transaction record
    //   if (offrampPayload.uuid && offrampPayload.fromWallet && offrampPayload.toWallet) {
    //     await this.updateTransactionRecord(
    //       offrampPayload.uuid,
    //       offrampPayload.fromWallet,
    //       offrampPayload.toWallet,
    //       result
    //     );
    //   }
      
    //   this.logger.log(`Instant offramp completed: ${JSON.stringify(result)}`);
    //   return result;
    } catch (error) {
      this.logger.error(
        `Instant offramp failed: ${error.message}`,
        error.stack,
        OfframpProcessor.name
      );
      
      // Record failed transaction
    //   if (job.data.uuid && job.data.fromWallet && job.data.toWallet) {
    //     await this.recordFailedTransaction(
    //       job.data.uuid,
    //       job.data.fromWallet,
    //       job.data.toWallet,
    //       error
    //     );
     // }
      
      throw new RpcException(`Failed to process instant offramp: ${error.message}`);
    }
  }
  

//   /**
//    * Updates transaction records in the database
//    */
//   private async updateTransactionRecord(
//     uuid: string | undefined,
//     fromWallet: string,
//     toWallet: string,
//     txResult: any
//   ) {
//     try {
//       if (!uuid) return; // Skip if no UUID provided
      
//       // Create a transaction record
//       await this.prismaService.transaction.create({
//         data: {
//           uuid: uuid,
//           type: 'OFFRAMP_TRANSFER',
//           status: 'COMPLETED',
//           from: fromWallet,
//           to: toWallet,
//           amount: txResult.amount,
//           info: {
//             txId: txResult.id,
//             timestamp: new Date().toISOString(),
//             result: txResult
//           }
//         }
//       });
//     } catch (dbError) {
//       this.logger.error(
//         `Failed to update transaction record: ${dbError.message}`,
//         dbError.stack,
//         OfframpProcessor.name
//       );
//     }
//   }

//   /**
//    * Records a failed transaction attempt
//    */
//   private async recordFailedTransaction(
//     uuid: string,
//     fromWallet: string,
//     toWallet: string,
//     error: any
//   ) {
//     try {
//       await this.prismaService.transaction.create({
//         data: {
//           uuid: uuid,
//           type: 'OFFRAMP_TRANSFER',
//           status: 'FAILED',
//           from: fromWallet,
//           to: toWallet,
//           info: {
//             error: error.message,
//             stack: error.stack,
//             timestamp: new Date().toISOString()
//           }
//         }
//       });
//     } catch (dbError) {
//       this.logger.error(
//         `Failed to record failed transaction: ${dbError.message}`,
//         dbError.stack,
//         OfframpProcessor.name
//       );
//     }
//   }

  /**
   * Helper to get settings values
   */
  private async getFromSettings(key: string): Promise<string> {
    try {
      const stellarSettings = await this.settingService.getPublic('STELLAR_SETTINGS');
      return (stellarSettings.value as any)[key] || '';
    } catch (error) {
      throw new RpcException(`Failed to get ${key} from settings: ${error.message}`);
    }
  }
}