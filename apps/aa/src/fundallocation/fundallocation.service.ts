import { Injectable } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import { createContractInstanceSign } from '../utils/web3';
import { PrismaService } from '@rumsan/prisma';
import { ethers } from 'ethers';

@Injectable()
export class FundService {
  constructor(
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService
  ) {}

  async addFundToProject(payload: any) {
    try {
      const { amount } = payload;
      const contractSettings = await this.settingService.getPublic('CONTRACTS');
      const contractValue = contractSettings?.value as any;
      const rahatTokenAddress = contractValue?.RAHATTOKEN?.ADDRESS;
      const cashTokenAddress = contractValue?.CASHTOKEN?.ADDRESS;
      const projectAddress = contractValue?.AAPROJECT?.ADDRESS;
      const amountWei = ethers.parseUnits(amount, 2);

      const donorContract = await createContractInstanceSign(
        'RAHATDONOR',
        this.prisma.setting
      );

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
