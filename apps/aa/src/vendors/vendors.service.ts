import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { BQUEUE, CORE_MODULE, DATA_SOURCES, JOBS } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PhasesService } from '../phases/phases.service';
import { PaginationBaseDto } from './common';
import { VendorStatsDto } from './dto/vendorStats.dto';
import { lastValueFrom } from 'rxjs';
import { ReceiveService } from '@rahataid/stellar-sdk';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy
  ) {
    this.receiveService = new ReceiveService();
  }

  receiveService = new ReceiveService();

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
    const vendor = await this.prisma.vendor.findUnique({
      where: { uuid: vendorWallet.uuid },
    });
    return this.getWalletStats({
      address: vendor.walletAddress,
    });
  }

  async getWalletStats(walletBalanceDto: VendorStatsDto) {
    return {
      balances: await this.receiveService.getAccountBalance(
        walletBalanceDto.address
      ),
      transactions: await this.getRecentTransactionDb(walletBalanceDto),
    };
  }

  private async getRecentTransactionDb(walletBalanceDto: VendorStatsDto) {
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

    const beneficiaryWalletAddresses = transactions.map(
      (txn) => txn.beneficiaryWalletAddress
    );

    const benResponse = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.get_bulk_by_wallet' },
        beneficiaryWalletAddresses
      )
    );

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
  }
}
