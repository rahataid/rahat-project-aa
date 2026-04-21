import { Injectable } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import {
  createContractInstance,
  createContractInstanceSign,
} from '../utils/web3';
import { PrismaService } from '@rumsan/prisma';
import { ethers } from 'ethers';
import { AddFund } from './dto/fundallocation.dto';

@Injectable()
export class FundService {
  constructor(
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService
  ) {}

  async addFundToProject(payload: AddFund) {
    try {
      const { amount } = payload;
      const contractSettings = await this.settingService.getPublic('CONTRACTS');
      const contractValue = contractSettings?.value as any;
      const rahatTokenAddress = contractValue?.RAHATTOKEN?.ADDRESS;
      const cashTokenAddress = contractValue?.CASHTOKEN?.ADDRESS;
      const projectAddress = contractValue?.AAPROJECT?.ADDRESS;

      const donorContract = await createContractInstanceSign(
        'RAHATDONOR',
        this.prisma.setting
      );

      const tokenContract = await createContractInstance(
        'RAHATTOKEN',
        this.prisma.setting
      );

      const decimal = await tokenContract.decimals.staticCall();
      const amountWei = ethers.parseUnits(amount, decimal);

      const tx = await donorContract?.mintTokens(
        rahatTokenAddress,
        projectAddress,
        cashTokenAddress,
        projectAddress,
        amountWei
      );
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      throw err;
    }
  }
}
