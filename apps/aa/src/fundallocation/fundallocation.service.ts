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
      const cashTokenValue = await this.settingService.getPublic(
        'CASH_TOKEN_CONTRACT'
      );
      const rahatTokenAddress = contractValue?.RAHATTOKEN?.ADDRESS;
      const cashTokenAddress = cashTokenValue?.value;
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

  async getTokenDetails() {
    try {
      const contractSettings = await this.settingService.getPublic('CONTRACT');
      const contractValue = contractSettings?.value as any;
      const projectAddress = contractValue?.AAPROJECT?.ADDRESS;
      console.log({ projectAddress });

      const tokenContract = await createContractInstance(
        'RAHATTOKEN',
        this.prisma.setting
      );

      const decimal = await tokenContract.decimals.staticCall();
      const name = await tokenContract.name.staticCall();
      const symbol = await tokenContract.symbol.staticCall();
      const totalSupply = await tokenContract.totalSupply.staticCall();
      const projectBalance = await tokenContract.balanceOf.staticCall(
        projectAddress
      );

      const transfer = await this.gettransferHistory(projectAddress);
      console.log(transfer);

      return {
        decimal: Number(decimal),
        name,
        symbol,
        totalSupply: ethers.formatUnits(totalSupply, Number(decimal)),
        projectBalance: ethers.formatUnits(projectBalance, Number(decimal)),
        projectAddress,
        tokenAddress: await tokenContract.getAddress(),
      };
    } catch (err) {
      throw err;
    }
  }

  private async gettransferHistory(projectAddress: string) {
    try {
      const graphSettings = await this.settingService.getPublic('SUBGRAPH_URL');
      const settingsValue = graphSettings?.value as any;
      const query = `
      query GetTransfers($projectAddress: [String!]!) {
        transfers(
          where: {
            or: [
              { from_in: $projectAddress },
              { to_in: $projectAddress }
            ]
          }
          orderBy: blockTimestamp
          orderDirection: desc
          first: 1000
        ) {
          id
          from
          to
          transactionHash
          blockNumber
          value
          blockTimestamp
        }
      }
    `;

      const response = await fetch(settingsValue?.URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { projectAddress },
        }),
      });
      console.log(response);
      const result = await response.json();

      return result?.data;
    } catch (err) {
      console.log(err);
      throw err;
    }
  }
}
