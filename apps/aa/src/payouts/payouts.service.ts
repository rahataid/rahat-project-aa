import { Injectable, Logger } from '@nestjs/common';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { Payouts, Prisma } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';
import { VendorsService } from '../vendors/vendors.service';
import { isUUID } from 'class-validator';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginatedResult } from '@rumsan/communication/types/pagination.types';
import { BeneficiaryPayoutDetails, IPaymentProvider } from './dto/types';
import { OfframpService } from './offramp.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import { FSPOfframpDetails, FSPPayoutDetails } from '../processors/types';
import { StellarService } from '../stellar/stellar.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private vendorsService: VendorsService,
    private offrampService: OfframpService,
    private stellarService: StellarService,
    @InjectQueue(BQUEUE.STELLAR)
    private readonly stellarQueue: Queue,
    private readonly beneficiaryService: BeneficiaryService
  ) {}

  async create(payload: CreatePayoutDto): Promise<Payouts> {
    const { groupId, ...createPayoutDto } = payload;
    try {
      this.logger.log(
        `Creating new payout for group: ${JSON.stringify(createPayoutDto)}`
      );

      const beneficiaryGroup =
        await this.prisma.beneficiaryGroupTokens.findFirst({
          where: { uuid: groupId },
        });

      if (!beneficiaryGroup) {
        throw new RpcException(
          `Beneficiary group tokens with UUID '${groupId}' not found`
        );
      }
      const existingPayout = await this.prisma.payouts.findFirst({
        where: { beneficiaryGroupToken: { uuid: groupId } },
      });

      if (existingPayout) {
        throw new RpcException(
          `Payout with groupId '${groupId}' already exists`
        );
      }

      /*
       * FSP Payout is done by the Offramp service so
       * we need to check and store the payout processor id
       * it be either id for ConnectIPS, Khalti and so on
       */

      //TODO validate bankdetails of the beneficiary
      if (createPayoutDto.type === 'FSP') {
        if (!createPayoutDto.payoutProcessorId) {
          throw new RpcException(
            `Payout processor ID is required for FSP payout`
          );
        }
      } else {
        /*
         * Offline Payout is done by the vendor so
         * we need to check and store the payout processor id which is vendor id
         * If the 'type' is Vendor and mode is OFFLINE
         */
        if (createPayoutDto.mode === 'OFFLINE') {
          if (!createPayoutDto.payoutProcessorId) {
            throw new RpcException(
              `Payout processor ID is required for OFFLINE payout`
            );
          }

          if (!isUUID(createPayoutDto.payoutProcessorId)) {
            throw new RpcException(`Payout processor ID is not a valid UUID`);
          }

          const vendor = await this.vendorsService.findOne(
            createPayoutDto.payoutProcessorId
          );

          if (!vendor) {
            throw new RpcException(
              `Vendor with ID '${createPayoutDto.payoutProcessorId}' not found`
            );
          }
        }
      }

      const payout = await this.prisma.payouts.create({
        data: {
          ...createPayoutDto,
          beneficiaryGroupToken: {
            connect: { uuid: groupId },
          },
        },
      });

      this.logger.log(`Successfully created payout with UUID: ${payout.uuid}`);
      return payout;
    } catch (error) {
      this.logger.error(
        `Failed to create payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async findAll(
    payload: { page?: number; perPage?: number } = { page: 1, perPage: 10 }
  ): Promise<PaginatedResult<Payouts>> {
    try {
      this.logger.log('Fetching all payouts');

      const { page, perPage } = payload;

      const query: Prisma.PayoutsFindManyArgs = {
        include: {
          beneficiaryGroupToken: {
            select: {
              uuid: true,
              status: true,
              numberOfTokens: true,
              isDisbursed: true,
              createdBy: true,
              beneficiaryGroup: {
                include: {
                  _count: {
                    select: {
                      beneficiaries: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      };

      const result: PaginatedResult<Payouts> = await paginate(
        this.prisma.payouts,
        query,
        {
          page,
          perPage,
        }
      );

      this.logger.log(`Successfully fetched ${result.data.length} payouts`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch payouts: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Find one payout
   * This is used to find one payout by UUID
   * 
   * @param uuid - The UUID of the payout
   * @returns { Payouts & { beneficiaryGroupToken?: { numberOfTokens?: number; beneficiaryGroup?: { beneficiaries?: any[]; }; }; } } - The payout
   */
  async findOne(uuid: string): Promise<
    Payouts & {
      beneficiaryGroupToken?: {
        numberOfTokens?: number;
        beneficiaryGroup?: {
          beneficiaries?: any[];
        };
      };
      isCompleted?: boolean;
      hasFailedPayoutRequests?: boolean;
      hasPayoutTriggered?: boolean;
    }
  > {
    try {
      this.logger.log(`Fetching payout with UUID: '${uuid}'`);

      const payout = await this.prisma.payouts.findUnique({
        where: { uuid },
        include: {
          beneficiaryRedeem: true,
          beneficiaryGroupToken: {
            include: {
              beneficiaryGroup: {
                include: {
                  beneficiaries: {
                    include: {
                      beneficiary: {
                        select: {
                          uuid: true,
                          walletAddress: true,
                          extras: true,
                        },
                      },
                    },
                  },
                  _count: {
                    select: {
                      beneficiaries: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!payout) {
        this.logger.warn(`Payout not found with UUID: '${uuid}'`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }

      const failedPayoutRequests = await this.beneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID(uuid);

      this.logger.log(`Successfully fetched payout with UUID: '${uuid}'`);
      return {
        ...payout,
        hasFailedPayoutRequests: failedPayoutRequests.length > 0,
        isCompleted: payout.beneficiaryRedeem.length > 0 && payout.beneficiaryRedeem.every((r) => r.isCompleted),
        hasPayoutTriggered: payout.beneficiaryRedeem.length > 0
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async update(
    uuid: string,
    updatePayoutDto: UpdatePayoutDto
  ): Promise<Payouts> {
    try {
      this.logger.log(`Updating payout with UUID: '${uuid}'`);

      const existingPayout = await this.prisma.payouts.findUnique({
        where: { uuid },
      });

      if (!existingPayout) {
        this.logger.warn(`Payout not found with UUID: ${uuid}`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }

      const updatedPayout = await this.prisma.payouts.update({
        where: { uuid },
        data: updatePayoutDto,
      });

      this.logger.log(`Successfully updated payout with UUID: '${uuid}'`);
      return updatedPayout;
    } catch (error) {
      this.logger.error(
        `Failed to update payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  // fetch addresses
  async fetchBeneficiaryPayoutDetails(
    uuid: string
  ): Promise<BeneficiaryPayoutDetails[]> {
    this.logger.log(
      `Fetching beneficiary wallet addresses for payout with UUID: '${uuid}'`
    );

    const payout = await this.findOne(uuid);

    if (!payout.beneficiaryGroupToken?.beneficiaryGroup?.beneficiaries) {
      this.logger.warn(
        `No beneficiaries found for payout with UUID: '${uuid}'`
      );
      return [];
    }

    //   "bank_name": "0401",
    // "bank_ac_name": "Ankit Neupane",
    // "bank_ac_number": "08110017501011"
    const numberOfTokensToTransfer =
      payout.beneficiaryGroupToken.numberOfTokens /
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length;

    // Extract the wallet addresses and bank-details from each beneficiary
    const BeneficiaryPayoutDetails =
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries
        .map((benfToGroup) => {
          return {
            amount: numberOfTokensToTransfer,
            walletAddress: benfToGroup.beneficiary?.walletAddress,
            bankDetails: {
              accountName: benfToGroup.beneficiary?.extras?.bank_ac_name || '',
              accountNumber:
                benfToGroup.beneficiary?.extras?.bank_ac_number || '',
              bankName: benfToGroup.beneficiary?.extras?.bank_name || '',
            },
          };
        })
        .filter((address) => address.walletAddress); // Filter out any undefined or null addresses
    // Check if any wallet addresses are null or undefined after filtering
    if (
      BeneficiaryPayoutDetails.length !==
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length
    ) {
      this.logger.error(
        `Some beneficiaries have null or undefined wallet addresses for payout with UUID: '${uuid}'`
      );
      throw new RpcException(
        'Some beneficiaries have missing wallet addresses'
      );
    }

    this.logger.log(
      `Successfully fetched ${BeneficiaryPayoutDetails.length} wallet addresses for payout with UUID: '${uuid}'`
    );
    return BeneficiaryPayoutDetails;
  }

  async getPaymentProvider(): Promise<IPaymentProvider[]> {
    return this.offrampService.getPaymentProvider();
  }

  async registerTokenTransferRequest(payload: {
    uuid: string;
    offrampWalletAddress: string;
    BeneficiaryPayoutDetails: BeneficiaryPayoutDetails[];
    payoutProcessorId: string;
  }) {
    const {
      uuid,
      offrampWalletAddress,
      BeneficiaryPayoutDetails,
      payoutProcessorId,
    } = payload;

    const stellerOfframpQueuePayload: FSPPayoutDetails[] =
      BeneficiaryPayoutDetails.map((beneficiary) => ({
        amount: beneficiary.amount,
        beneficiaryWalletAddress: beneficiary.walletAddress,
        beneficiaryBankDetails: beneficiary.bankDetails,
        payoutUUID: uuid,
        payoutProcessorId: payoutProcessorId,
        offrampWalletAddress,
      }));

    const d = await this.stellarService.addBulkToTokenTransferQueue(
      stellerOfframpQueuePayload
    );

    return d;
  }

  async triggerPayout(uuid: string): Promise<any> {
    //TODO: verify trustline of beneficiary wallet addresses
    const payoutDetails = await this.findOne(uuid);
    if(payoutDetails.hasPayoutTriggered) {
      throw new RpcException(`Payout with UUID '${uuid}' has already been triggered`);
    }

    const BeneficiaryPayoutDetails = await this.fetchBeneficiaryPayoutDetails(
      uuid
    );
    const offrampWalletAddress =
      await this.offrampService.getOfframpWalletAddress();

    console.log('Offramp Wallet Address:', offrampWalletAddress);
    console.log('Beneficiary Wallet Addresses:', BeneficiaryPayoutDetails);

    const stellerOfframpQueuePayload: FSPPayoutDetails[] =
      BeneficiaryPayoutDetails.map((beneficiary) => ({
        amount: beneficiary.amount,
        beneficiaryWalletAddress: beneficiary.walletAddress,
        beneficiaryBankDetails: beneficiary.bankDetails,
        payoutUUID: uuid,
        payoutProcessorId: payoutDetails.payoutProcessorId,
        offrampWalletAddress,
      }));

    await this.stellarService.addBulkToTokenTransferQueue(
      stellerOfframpQueuePayload
    );

    return 'Payout Initiated Successfully';
  }

  async triggerOneFailedPayoutRequest(payload: {
    beneficiaryRedeemUuid: string;
    // payoutUUID: string;
  }): Promise<any> {
    const { beneficiaryRedeemUuid } = payload;

    this.logger.log(
      `Triggering payout for failed request with UUID: ${beneficiaryRedeemUuid}`
    );
    try {
      const benfRedeemRequest =
        await this.beneficiaryService.getBeneficiaryRedeem(
          beneficiaryRedeemUuid
        );

      if (!benfRedeemRequest) {
        throw new RpcException(
          `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' not found`
        );
      }

      if (benfRedeemRequest.isCompleted)
        throw new RpcException(
          `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already completed`
        );

      const transactionType = benfRedeemRequest.transactionType;

      if (transactionType === 'VENDOR_REIMBURSEMENT')
        throw new RpcException(
          `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is not a FSP Payout request`
        );

      if (transactionType === 'TOKEN_TRANSFER') {
        return await this.processOneFailedTokenTransferPayout({
          beneficiaryRedeemUuid,
        });
      }
      if (transactionType === 'FIAT_TRANSFER') {
        return await this.processOneFailedFiatPayout({
          beneficiaryRedeemUuid,
        });
      }

      throw new RpcException(
        `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is not a FSP Payout request`
      );
    } catch (error) {
      this.logger.error(
        `Failed to trigger payout for failed request: ${error.message}`,
        error.stack
      );

      throw new RpcException(error.message);
    }
  }

  /**
   * Trigger a failed payout request
   * This is used to trigger a failed payout request for a payout
   * 
   * @param payload - The payload containing the payout UUID
   * @returns { message: string } - The result of the trigger
   */
  async triggerFailedPayoutRequest(payload: { payoutUUID: string }) {
    try {
      const { payoutUUID } = payload;

      if (!payoutUUID) {
        throw new RpcException(
          'Payout UUID is required for failed payout request'
        );
      }

      const payout = await this.findOne(payoutUUID);
      if (!payout) {
        throw new RpcException(
          `Payout with UUID '${payoutUUID}' not found for failed payout request`
        );
      }

      if(!payout.hasPayoutTriggered) {
        throw new RpcException(`Payout with UUID '${payoutUUID}' has not been triggered`);
      }

      const result =
        await this.beneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID(
          payoutUUID
        );

      const failedFiatRecords = result.find(
        (r) => r.status === 'FIAT_TRANSACTION_FAILED'
      ) || {
        status: 'FIAT_TRANSACTION_FAILED',
        count: 0,
        beneficiaryRedeems: [],
      };
      const failedTokenRecords = result.find(
        (r) => r.status === 'TOKEN_TRANSACTION_FAILED'
      ) || {
        status: 'TOKEN_TRANSACTION_FAILED',
        count: 0,
        beneficiaryRedeems: [],
      };

      if (!failedFiatRecords.count && !failedTokenRecords.count) {
        return {
          message: `No failed fiat or token payouts found for payout with UUID '${payoutUUID}'`,
        };
      }

      this.logger.log(`Failed fiat payouts: ${failedFiatRecords.count}`);
      this.logger.log(`Failed token payouts: ${failedTokenRecords.count}`);

      const failedFiatPayouts = await this.createBulkFailedRequestPayout(
        failedFiatRecords.beneficiaryRedeems.map((r) => r.uuid)
      );

      const failedTokenPayouts = await this.createBulkFailedRequestPayout(
        failedTokenRecords.beneficiaryRedeems.map((r) => r.uuid)
      );

      await this.offrampService.addBulkToOfframpQueue(failedFiatPayouts);

      await this.stellarService.addBulkToTokenTransferQueue(failedTokenPayouts);

      return {
        message: `Processing ${failedFiatRecords.count} failed fiat payouts and ${failedTokenRecords.count} failed token payouts`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to trigger failed payout request: ${error.message}`,
        error.stack
      );

      throw new RpcException(error.message);
    }
  }

  /**
   * Get payout logs
   * This is used to get payout logs for a payout
   * 
   * @param payload - The payload containing the payout UUID, transaction type, transaction status, page, perPage, sort, and order
   * @returns { any } - The payout logs
   */
  async getPayoutLogs(payload: GetPayoutLogsDto) {
    const {
      payoutUUID,
      transactionType,
      transactionStatus,
      page,
      perPage,
      sort,
      order,
    } = payload;

    this.logger.log(`Getting payout logs for payout with UUID: ${payoutUUID}`);
    try {
      const payout = await this.findOne(payoutUUID);

      if (!payout) {
        throw new RpcException(`Payout with UUID '${payoutUUID}' not found`);
      }

      const query: Prisma.BeneficiaryRedeemFindManyArgs = {
        where: {
          payoutId: payoutUUID,
          ...(transactionType && { transactionType }),
          ...(transactionStatus && { status: transactionStatus }),
        },
        orderBy: {
          // status: 'asc'
          isCompleted: 'asc',
        },
        /*
        ...(sort && {
          orderBy: {
            // [sort]: order,
          },
        }),
        */
      };

      const logs = await paginate(
        this.prisma.beneficiaryRedeem,
        {
          ...query,
        },
        {
          page,
          perPage,
        }
      );
      return logs;
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  /**
   * Get a payout log
   * This is used to get a payout log for a beneficiary redeem
   * 
   * @param uuid - The UUID of the beneficiary redeem request
   * @returns { BeneficiaryRedeem } - The payout log
   */
  async getPayoutLog(uuid: string): Promise<any> {
    this.logger.log(
      `Getting payout log for beneficiary redeem with UUID: ${uuid}`
    );
    try {
      const log = await this.prisma.beneficiaryRedeem.findUnique({
        where: {
          uuid,
        },
        include: {
          Beneficiary: true,
          payout: true,
        },
      });

      if (!log) {
        throw new RpcException(
          `Beneficiary redeem log with UUID '${uuid}' not found`
        );
      }

      return log;
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  /**
   * Process a failed fiat payout
   * This is used to process a failed fiat payout for a beneficiary redeem
   * 
   * @param payload - The payload containing the beneficiary redeem UUID
   * @returns { success: boolean, message: string } - The result of the process
   */
  async processOneFailedFiatPayout(payload: { beneficiaryRedeemUuid: string }) {
    try {
      const { beneficiaryRedeemUuid } = payload;

      const offrampQueuePayload = await this.createFailedRequestPayout(
        beneficiaryRedeemUuid
      );

      await this.offrampService.addToOfframpQueue(offrampQueuePayload);

      this.logger.log(
        `Added to offramp queue for beneficiary redeem with UUID: ${beneficiaryRedeemUuid}`
      );

      return {
        success: true,
        message: 'Fiat payout triggered successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to process one failed fiat payout: ${error.message}`,
        error.stack
      );

      throw new RpcException(error.message);
    }
  }

  /**
   * Process a failed token transfer payout
   * This is used to process a failed token transfer payout for a beneficiary redeem
   * 
   * @param payload - The payload containing the beneficiary redeem UUID
   * @returns { success: boolean, message: string } - The result of the process
   */
  async processOneFailedTokenTransferPayout(payload: {
    beneficiaryRedeemUuid: string;
  }) {
    const { beneficiaryRedeemUuid } = payload;

    const offrampQueuePayload = await this.createFailedRequestPayout(
      beneficiaryRedeemUuid
    );

    await this.stellarService.addToTokenTransferQueue(offrampQueuePayload);


    this.logger.log(
      `Added to token transfer queue for beneficiary redeem with UUID: ${beneficiaryRedeemUuid}`
    );
    return {
      success: true,
      message: 'Token transfer triggered successfully',
    };
  }

  /**
   * Create a bulk failed request payout
   * This is used to create a bulk failed request payout for a beneficiary redeem
   * 
   * @param beneficiaryRedeemUuids - The UUIDs of the beneficiary redeem requests
   * @returns (FSPPayoutDetails | FSPOfframpDetails)[] - The bulk failed request payout
   */
  private async createBulkFailedRequestPayout(
    beneficiaryRedeemUuids: string[]
  ): Promise<(FSPPayoutDetails | FSPOfframpDetails)[]> {
    const res = await Promise.all(
      beneficiaryRedeemUuids.map(async (uuid) => {
        const benfRedeemRequest = await this.createFailedRequestPayout(uuid);

        return benfRedeemRequest;
      })
    );

    return res.filter((r) => r !== null);
  }

  /**
  * Create a failed request payout
  * This is used to create a failed request payout for a beneficiary redeem
  * 
  * @param beneficiaryRedeemUuid - The UUID of the beneficiary redeem request
  * @returns FSPPayoutDetails | FSPOfframpDetails 
  */
  private async createFailedRequestPayout(
    beneficiaryRedeemUuid: string
  ): Promise<FSPPayoutDetails | FSPOfframpDetails> {
    const benfRedeemRequest =
      await this.beneficiaryService.getBeneficiaryRedeem(beneficiaryRedeemUuid);

    if (!benfRedeemRequest) {
      throw new RpcException(
        `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' not found`
      );
    }

    const benfExtras = benfRedeemRequest.Beneficiary.extras as {
      bank_ac_name: string;
      bank_ac_number: string;
      bank_name: string;
    };

    const info = benfRedeemRequest.info as {
      offrampWalletAddress: string;
      beneficiaryWalletAddress: string;
      numberOfAttempts: number;
      transactionHash?: string;
      error: string;
    };

    // check if offrampWalletAddress is in the info
    if (!info.offrampWalletAddress) {
      throw new RpcException(
        `Offramp wallet address not found for beneficiary redeem request with UUID '${beneficiaryRedeemUuid}'`
      );
    }

    const offrampQueuePayload: FSPOfframpDetails = {
      amount: benfRedeemRequest.amount,
      beneficiaryBankDetails: {
        accountName: benfExtras.bank_ac_name,
        accountNumber: benfExtras.bank_ac_number,
        bankName: benfExtras.bank_name,
      },
      beneficiaryWalletAddress: benfRedeemRequest.beneficiaryWalletAddress,
      offrampWalletAddress: info.offrampWalletAddress,
      payoutUUID: benfRedeemRequest.payoutId,
      payoutProcessorId: benfRedeemRequest.fspId,
      transactionHash: info?.transactionHash || null,
      beneficiaryRedeemUUID: benfRedeemRequest.uuid,
    };
    return offrampQueuePayload;
  }
}
