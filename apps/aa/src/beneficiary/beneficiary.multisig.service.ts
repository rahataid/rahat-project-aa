import { Injectable } from '@nestjs/common';
import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { PrismaService } from '@rumsan/prisma';
import { ethers, JsonRpcProvider } from 'ethers';
import { createContractInstance, getWalletFromPrivateKey } from '../utils/web3';
import { erc20Abi } from '../utils/constant';
import {
  MetaTransactionData,
  OperationType,
} from '@safe-global/safe-core-sdk-types';

@Injectable()
export class BeneficiaryMultisigService {
  private safeApiKit: SafeApiKit;
  private NETWORK_PROVIDER: string;
  private SAFE_PROPOSER_PRIVATE_ADDRESS: string;
  constructor(protected prisma: PrismaService) {}

  async onModuleInit() {
    const chainSettings = await this.prisma.setting.findFirst({
      where: {
        name: 'CHAIN_SETTINGS',
      },
    });

    const safeProposerPrivateKeySetting = await this.prisma.setting.findFirst({
      where: {
        name: 'SAFE_PROPOSER_PRIVATE_ADDRESS',
      },
    });

    if (!chainSettings || !safeProposerPrivateKeySetting) {
      throw new Error(
        'CHAIN_SETTINGS, SAFE_PROPOSER_PRIVATE_ADDRESS may be missing'
      );
    }

    const CHAIN_ID = chainSettings.value['chainId'];
    this.safeApiKit = new SafeApiKit({
      chainId: BigInt(CHAIN_ID),
    });

    this.NETWORK_PROVIDER = chainSettings.value['rpcUrl'];
    this.SAFE_PROPOSER_PRIVATE_ADDRESS =
      safeProposerPrivateKeySetting.value as string;
  }

  async getSafeInstance() {
    //CONSTANTS for BASE SEPOLIA
    //TODO: getit from settings
    const SAFE_ADDRESS = await this.prisma.setting.findFirst({
      where: {
        name: 'SAFE_WALLET',
      },
    });

    const safeKit = await Safe.init({
      provider: this.NETWORK_PROVIDER,
      signer: this.SAFE_PROPOSER_PRIVATE_ADDRESS,
      safeAddress: SAFE_ADDRESS.value['ADDRESS'],
    });

    return safeKit;
  }

  async getOwnersList() {
    try {
      const SAFE_ADDRESS = await this.prisma.setting.findFirst({
        where: {
          name: 'SAFE_WALLET',
        },
      });

      const safeinstance = await this.getSafeInstance();

      const balance = await safeinstance.getBalance();

      const safeDetails = await this.safeApiKit.getSafeInfo(
        SAFE_ADDRESS.value['ADDRESS']
      );

      const address = SAFE_ADDRESS.value['ADDRESS'];

      const contract = await createContractInstance(
        'RAHATTOKEN',
        this.prisma.setting
      );

      const safeBalance = await contract.balanceOf.staticCall(address);
      const decimals = await contract.decimals.staticCall();
      const safeInfo = {
        ...safeDetails,
        nativeBalance: ethers.formatUnits(balance, decimals),
        tokenBalance: ethers.formatUnits(safeBalance, decimals),
      };
      return safeInfo;
    } catch (err) {
      console.log(err);
    }
  }

  async generateTransactionData(amount: string) {
    const CONTRACTS = await this.prisma.setting.findUnique({
      where: {
        name: 'CONTRACTS',
      },
    });
    const aaAddress = CONTRACTS.value['AAPROJECT']['ADDRESS'];
    const tokenAddress = CONTRACTS.value['RAHATTOKEN']['ADDRESS'];

    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      new JsonRpcProvider(this.NETWORK_PROVIDER)
    );
    // getWalletFromPrivateKey(process.env.SAFE_PROPOSER_PRIVATE_ADDRESS));
    const decimals = await tokenContract.decimals();
    const tokenApprovalEncodedData = tokenContract.interface.encodeFunctionData(
      'transfer',
      [aaAddress, ethers.parseUnits(amount, decimals)]
    );
    // Create transaction
    const safeTransactionData: MetaTransactionData = {
      to: tokenAddress,
      value: '0', // in wei
      data: tokenApprovalEncodedData,
      operation: OperationType.Call,
    };

    return safeTransactionData;
  }

  async createSafeTransaction(payload: { amount: string }) {
    try {
      const transactionData = await this.generateTransactionData(
        payload.amount
      );

      const safeWallet = await this.getSafeInstance();

      const safeTransaction = await safeWallet.createTransaction({
        transactions: [transactionData],
      });
      const safeTxHash = await safeWallet.getTransactionHash(safeTransaction);
      const signature = await safeWallet.signHash(safeTxHash);
      const deployerWallet = getWalletFromPrivateKey(
        this.SAFE_PROPOSER_PRIVATE_ADDRESS
      );
      const safeAddress = await safeWallet.getAddress();

      // Propose transaction to the service

      await this.safeApiKit.proposeTransaction({
        safeAddress: safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: deployerWallet.address,
        senderSignature: signature.data,
      });

      // console.log({
      //   safeAddress,
      //   safeTransactionData: safeTransaction.data,
      //   safeTxHash,
      //   senderAddress: deployerWallet.address,
      //   senderSignature: signature.data,
      // });

      return {
        safeAddress: safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: deployerWallet.address,
        senderSignature: signature.data,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
