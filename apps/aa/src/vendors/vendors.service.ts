import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { CORE_MODULE } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginationBaseDto } from './common';
import { VendorRedeemDto, VendorStatsDto } from './dto/vendorStats.dto';
import { lastValueFrom } from 'rxjs';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly receiveService: ReceiveService
  ) {}

  async listWithProjectData(query: PaginationBaseDto) {
    return paginate(
      this.prisma.vendor,
      {
        where: {
          name: { contains: query.search, mode: 'insensitive' },
        },
      },
      {
        page: query.page,
        perPage: query.perPage,
      }
    );
  }

  async findOne(uuid: string) {
    return this.prisma.vendor.findUnique({
      where: { uuid },
    });
  }

  async getVendorWalletStats(vendorWallet: VendorStatsDto) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: vendorWallet.uuid },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with id ${vendorWallet.uuid} not found`);
      }

      const vendorBalance = await this.receiveService.getAccountBalance(
        vendor.walletAddress
      );

      if (!vendorBalance) {
        throw new RpcException(
          `Failed to get balance for vendor with id ${vendorWallet.uuid}`
        );
      }

      return {
        assignedTokens: await this.getVendorAssignedTokens(
          vendorWallet.uuid,
          false
        ),
        disbursedTokens: await this.getVendorAssignedTokens(
          vendorWallet.uuid,
          true
        ),
        balances: vendorBalance,
        transactions: await this.getRecentTransactionDb(vendorWallet),
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getVendorAssignedTokens(
    vendorUuid: string,
    disbursed: boolean = false
  ) {
    try {
      this.logger.log(`Getting assigned tokens for vendor ${vendorUuid}`);

      const payouts = await this.prisma.payouts.findMany({
        where: {
          type: 'VENDOR',
          payoutProcessorId: vendorUuid,
          ...(disbursed && {
            beneficiaryGroupToken: {
              isDisbursed: true,
            },
          }),
        },
        include: {
          beneficiaryGroupToken: true,
        },
      });

      const totalAssignedTokens = payouts.reduce((acc, payout) => {
        return acc + Number(payout.beneficiaryGroupToken.numberOfTokens);
      }, 0);

      return totalAssignedTokens;
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getRedemptionRequest(vendorWallet: VendorRedeemDto) {
    try {
      const redemptionRequest = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          vendorUid: vendorWallet.uuid,
        },
        take: vendorWallet.take || 10,
        skip: vendorWallet.skip || 0,
      });

      if (!redemptionRequest.length) {
        throw new RpcException('No redemption requests found for vendor');
      }

      return redemptionRequest;
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getTxnAndRedemptionList(payload: VendorRedeemTxnListDto) {
    try {
      console.log(payload);
      const { page, perPage, uuid, txHash } = payload;
      const query = {
        where: {
          vendorUid: uuid,
          ...(txHash && { txHash }),
        },
        orderBy: {
          createdAt: 'desc',
        },
      };

      return paginate(this.prisma.beneficiaryRedeem, query, {
        page,
        perPage,
      });
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  private async getRecentTransactionDb(walletBalanceDto: VendorStatsDto) {
    try {
      const transactions = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          vendorUid: walletBalanceDto.uuid,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: walletBalanceDto.take || 10,
        skip: walletBalanceDto.skip || 0,
      });

      if (!transactions) {
        throw new RpcException(
          `Transactions not found for vendor with id ${walletBalanceDto.uuid}`
        );
      }

      const beneficiaryWalletAddresses = transactions.map(
        (txn) => txn.beneficiaryWalletAddress
      );

      const benResponse = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.beneficiary.get_bulk_by_wallet' },
          beneficiaryWalletAddresses
        )
      );

      if (!benResponse) {
        throw new RpcException(`Failed to get beneficiaries info`);
      }

      return transactions.map((txn) => {
        return {
          title: txn.transactionType,
          subtitle: txn.beneficiaryWalletAddress,
          date: txn.createdAt,
          amount: Number(txn.amount).toFixed(0),
          hash: txn.txHash,
          beneficiaryName: benResponse.find(
            (ben) => ben.walletAddress === txn.beneficiaryWalletAddress
          )?.piiData?.name,
        };
      });
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }
}
