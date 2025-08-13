import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { CORE_MODULE } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginationBaseDto } from './common';
import { VendorRedeemDto, VendorStatsDto } from './dto/vendorStats.dto';
import { lastValueFrom } from 'rxjs';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';

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
    const { page, perPage, sort, order, search } = query;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    return paginate(
      this.prisma.vendor,
      {
        where: {
          name: { contains: search, mode: 'insensitive' },
        },
        orderBy,
      },
      {
        page,
        perPage,
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
      const { page, perPage, uuid, txHash, status } = payload;
      const query = {
        where: {
          vendorUid: uuid,
          ...(txHash && { txHash }),
          ...(status === 'success' && {
            status: 'TOKEN_TRANSACTION_COMPLETED',
          }),
        },
        include: {
          Beneficiary: {
            select: {
              uuid: true,
              extras: true,
              walletAddress: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      };

      // Get paginated transactions
      const result = await paginate(this.prisma.beneficiaryRedeem, query, {
        page,
        perPage,
      });

      // Get beneficiary UUIDs for name lookup
      const beneficiaryUuids = result.data
        .map((redeem: any) => redeem.Beneficiary?.uuid)
        .filter(Boolean);

      this.logger.log(
        `Found ${
          beneficiaryUuids.length
        } beneficiary UUIDs for name lookup: ${JSON.stringify(
          beneficiaryUuids
        )}`
      );

      let benResponse = [];
      if (beneficiaryUuids.length) {
        benResponse = await lastValueFrom(
          this.client.send(
            { cmd: 'rahat.jobs.beneficiary.find_phone_by_uuid' },
            beneficiaryUuids
          )
        );
        this.logger.log(
          `Received beneficiary response: ${JSON.stringify(benResponse)}`
        );
      }

      // Transform the data to include phone number from extras and name from benResponse
      const transformedData = result.data.map((redeem: any) => {
        const benInfo = benResponse.find(
          (b: any) => b.uuid === redeem.Beneficiary?.uuid
        );
        this.logger.log(
          `Looking for beneficiary ${
            redeem.Beneficiary?.uuid
          }, found: ${JSON.stringify(benInfo)}`
        );
        return {
          ...redeem,
          Beneficiary: {
            ...redeem.Beneficiary,
            phone: (redeem.Beneficiary?.extras as any)?.phone || null,
            name: benInfo?.name || null,
          },
        };
      });

      return {
        ...result,
        data: transformedData,
      };
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

  async getVendorBeneficiaries(payload: VendorBeneficiariesDto) {
    try {
      this.logger.log(
        `Getting beneficiaries for vendor ${payload.vendorUuid} with payout mode ${payload.payoutMode}`
      );

      // First verify the vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: payload.vendorUuid },
      });

      if (!vendor) {
        throw new RpcException(
          `Vendor with id ${payload.vendorUuid} not found`
        );
      }

      if (payload.payoutMode === 'ONLINE') {
        // For ONLINE mode: Get beneficiaries who have been charged by this vendor
        this.logger.log(
          `Getting beneficiaries charged by vendor ${payload.vendorUuid} for ONLINE mode`
        );

        // Build where clause for beneficiary redeem query
        const redeemWhereClause: any = {
          transactionType: 'VENDOR_REIMBURSEMENT',
          vendorUid: payload.vendorUuid,
        };

        // Add wallet address filter if provided
        if (payload.walletAddress) {
          redeemWhereClause.beneficiaryWalletAddress = payload.walletAddress;
        }

        // Get beneficiaries who have been charged by this vendor
        const chargedBeneficiaries =
          await this.prisma.beneficiaryRedeem.findMany({
            where: redeemWhereClause,
            include: {
              Beneficiary: {
                select: {
                  uuid: true,
                  walletAddress: true,
                  phone: true,
                  gender: true,
                  benTokens: true,
                  isVerified: true,
                  createdAt: true,
                },
              },
            },
          });

        // Extract unique beneficiaries (remove duplicates based on UUID)
        const uniqueBeneficiaries = chargedBeneficiaries
          .map((redeem) => redeem.Beneficiary)
          .filter(
            (beneficiary, index, self) =>
              index === self.findIndex((b) => b.uuid === beneficiary.uuid)
          );

        this.logger.log(
          `Found ${uniqueBeneficiaries.length} unique beneficiaries charged by vendor ${payload.vendorUuid}`
        );

        // Get beneficiary UUIDs for enrichment
        const beneficiaryUuids = uniqueBeneficiaries.map((ben) => ben.uuid);
        let benResponse = [];
        if (beneficiaryUuids.length) {
          benResponse = await lastValueFrom(
            this.client.send(
              { cmd: 'rahat.jobs.beneficiary.find_phone_by_uuid' },
              beneficiaryUuids
            )
          );
        }

        // Get transaction hash and status information for each beneficiary
        const beneficiaryWalletAddresses = uniqueBeneficiaries.map(
          (ben) => ben.walletAddress
        );
        const beneficiaryTransactions =
          await this.prisma.beneficiaryRedeem.findMany({
            where: {
              beneficiaryWalletAddress: { in: beneficiaryWalletAddresses },
              transactionType: 'VENDOR_REIMBURSEMENT',
            },
            select: {
              beneficiaryWalletAddress: true,
              txHash: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          });

        // Create maps of wallet address to latest transaction hash and status
        const transactionMap = new Map();
        const statusMap = new Map();
        beneficiaryTransactions.forEach((tx) => {
          if (!transactionMap.has(tx.beneficiaryWalletAddress)) {
            transactionMap.set(tx.beneficiaryWalletAddress, tx.txHash);
            statusMap.set(tx.beneficiaryWalletAddress, tx.status);
          }
        });

        // Attach beneficiary name, transaction hash, and status to each beneficiary
        const enrichedBeneficiaries = uniqueBeneficiaries.map((ben) => {
          const benInfo = benResponse.find((b) => b.uuid === ben.uuid);
          return {
            ...ben,
            name: benInfo?.name || null,
            txHash: transactionMap.get(ben.walletAddress) || null,
            status: statusMap.get(ben.walletAddress) || null,
          };
        });

        // Use the reusable paginator
        return paginate(
          {
            findMany: async () => enrichedBeneficiaries,
            count: async () => enrichedBeneficiaries.length,
          },
          {},
          { page: payload.page, perPage: payload.perPage }
        );
      } else if (payload.payoutMode === 'OFFLINE') {
        // For OFFLINE mode: Keep existing logic unchanged
        this.logger.log(
          `Getting beneficiaries for vendor ${payload.vendorUuid} in OFFLINE mode`
        );

        const payoutsQuery = {
          where: {
            type: 'VENDOR' as const,
            mode: 'OFFLINE' as const,
            payoutProcessorId: payload.vendorUuid,
            beneficiaryGroupToken: {
              isNot: null,
            },
          },
        };

        // Get payouts that match the criteria
        const payouts = await this.prisma.payouts.findMany({
          ...payoutsQuery,
        });
        this.logger.log('Payouts found: ' + JSON.stringify(payouts));

        if (!payouts.length) {
          return paginate(
            { findMany: async () => [], count: async () => 0 },
            {},
            { page: payload.page, perPage: payload.perPage }
          );
        }

        // Get all beneficiary group tokens that are associated with these payouts
        const payoutIds = payouts.map((payout) => payout.uuid);
        const groupTokens = await this.prisma.beneficiaryGroupTokens.findMany({
          where: {
            payoutId: {
              in: payoutIds,
            },
          },
        });
        this.logger.log('Group tokens found: ' + JSON.stringify(groupTokens));

        if (!groupTokens.length) {
          return paginate(
            { findMany: async () => [], count: async () => 0 },
            {},
            { page: payload.page, perPage: payload.perPage }
          );
        }

        // Get group IDs from tokens
        const groupIds = groupTokens.map((token) => token.groupId);
        this.logger.log(
          'Group IDs for beneficiary query: ' + JSON.stringify(groupIds)
        );

        // Fetch group details and filter by purpose (exclude COMMUNICATION)
        const groups = await this.prisma.beneficiaryGroups.findMany({
          where: {
            uuid: { in: groupIds },
            groupPurpose: { not: 'COMMUNICATION' },
          },
        });
        const payoutGroupIds = groups.map((g) => g.uuid);
        this.logger.log(
          'Filtered payout group IDs: ' + JSON.stringify(payoutGroupIds)
        );

        if (!payoutGroupIds.length) {
          return paginate(
            { findMany: async () => [], count: async () => 0 },
            {},
            { page: payload.page, perPage: payload.perPage }
          );
        }

        // Build where clause for beneficiary query
        const beneficiaryWhereClause: any = {
          groupId: { in: payoutGroupIds },
        };

        // Add wallet address filter if provided
        if (payload.walletAddress) {
          beneficiaryWhereClause.beneficiary = {
            walletAddress: payload.walletAddress,
          };
        }

        // Use only payout-eligible group IDs for beneficiary query
        const beneficiaries = await this.prisma.beneficiaryToGroup.findMany({
          where: beneficiaryWhereClause,
          include: {
            beneficiary: {
              select: {
                uuid: true,
                walletAddress: true,
                phone: true,
                gender: true,
                benTokens: true,
                isVerified: true,
                createdAt: true,
              },
            },
          },
        });

        // Extract beneficiary data
        const allBeneficiaries = beneficiaries.map(
          (beneficiaryToGroup) => beneficiaryToGroup.beneficiary
        );

        // Remove duplicates based on UUID
        const uniqueBeneficiaries = allBeneficiaries.filter(
          (beneficiary, index, self) =>
            index === self.findIndex((b) => b.uuid === beneficiary.uuid)
        );

        // Get beneficiary UUIDs
        const beneficiaryUuids = uniqueBeneficiaries.map((ben) => ben.uuid);
        let benResponse = [];
        if (beneficiaryUuids.length) {
          benResponse = await lastValueFrom(
            this.client.send(
              { cmd: 'rahat.jobs.beneficiary.find_phone_by_uuid' },
              beneficiaryUuids
            )
          );
        }

        // Get transaction hash and status information for each beneficiary
        const beneficiaryWalletAddresses = uniqueBeneficiaries.map(
          (ben) => ben.walletAddress
        );
        const beneficiaryTransactions =
          await this.prisma.beneficiaryRedeem.findMany({
            where: {
              beneficiaryWalletAddress: { in: beneficiaryWalletAddresses },
              transactionType: 'VENDOR_REIMBURSEMENT',
            },
            select: {
              beneficiaryWalletAddress: true,
              txHash: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          });

        // Create maps of wallet address to latest transaction hash and status
        const transactionMap = new Map();
        const statusMap = new Map();
        beneficiaryTransactions.forEach((tx) => {
          if (!transactionMap.has(tx.beneficiaryWalletAddress)) {
            transactionMap.set(tx.beneficiaryWalletAddress, tx.txHash);
            statusMap.set(tx.beneficiaryWalletAddress, tx.status);
          }
        });

        // Attach beneficiary name, transaction hash, and status to each beneficiary
        const enrichedBeneficiaries = uniqueBeneficiaries.map((ben) => {
          const benInfo = benResponse.find((b) => b.uuid === ben.uuid);
          return {
            ...ben,
            name: benInfo?.name || null,
            txHash: transactionMap.get(ben.walletAddress) || null,
            status: statusMap.get(ben.walletAddress) || null,
          };
        });

        // Use the reusable paginator
        return paginate(
          {
            findMany: async () => enrichedBeneficiaries,
            count: async () => enrichedBeneficiaries.length,
          },
          {},
          { page: payload.page, perPage: payload.perPage }
        );
      } else {
        throw new RpcException(`Invalid payout mode: ${payload.payoutMode}`);
      }
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }
}
