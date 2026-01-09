import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, JOBS } from '../constants';
import { Job } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import { JsonRpcProvider, ethers } from 'ethers';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { lowerCaseObjectKeys } from '../utils/utility';

type IStringArr = string[];
type ICallData = IStringArr[];

const ABI = [
  {
    inputs: [
      {
        internalType: 'string',
        name: '_name',
        type: 'string',
      },
      {
        internalType: 'address',
        name: '_defaultToken',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_forwarder',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_accessManager',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_triggerManager',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'authority',
        type: 'address',
      },
    ],
    name: 'AccessManagedInvalidAuthority',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        internalType: 'uint32',
        name: 'delay',
        type: 'uint32',
      },
    ],
    name: 'AccessManagedRequiredDelay',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
    ],
    name: 'AccessManagedUnauthorized',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
    ],
    name: 'AddressEmptyCode',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FailedInnerCall',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'authority',
        type: 'address',
      },
    ],
    name: 'AuthorityUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'beneficiary',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'BenTokensAssigned',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'BeneficiaryAdded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'BeneficiaryRemoved',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'beneficiary',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'assigner',
        type: 'address',
      },
    ],
    name: 'ClaimAssigned',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'tokenAddress',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'TokenBudgetDecrease',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'tokenAddress',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'TokenBudgetIncrease',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'from',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'TokenReceived',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'tokenAddress',
        type: 'address',
      },
    ],
    name: 'TokenRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'TokenTransfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'beneficiary',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'vendor',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'TokenTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'vendorAddress',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bool',
        name: 'status',
        type: 'bool',
      },
    ],
    name: 'VendorUpdated',
    type: 'event',
  },
  {
    inputs: [],
    name: 'IID_RAHAT_PROJECT',
    outputs: [
      {
        internalType: 'bytes4',
        name: '',
        type: 'bytes4',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'TriggerManager',
    outputs: [
      {
        internalType: 'contract ITriggerManager',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
    ],
    name: 'addBeneficiary',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_beneficiary',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_tokenAssigned',
        type: 'uint256',
      },
    ],
    name: 'assignClaims',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_amount',
        type: 'uint256',
      },
    ],
    name: 'assignTokenToBeneficiary',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'authority',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'benTokens',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'beneficiaryCount',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
    ],
    name: 'checkVendorStatus',
    outputs: [
      {
        internalType: 'bool',
        name: '_vendorStatus',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultToken',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_tokenAddress',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_amount',
        type: 'uint256',
      },
    ],
    name: 'increaseTokenBudget',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
    ],
    name: 'isBeneficiary',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isConsumingScheduledOp',
    outputs: [
      {
        internalType: 'bytes4',
        name: '',
        type: 'bytes4',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'forwarder',
        type: 'address',
      },
    ],
    name: 'isTrustedForwarder',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes[]',
        name: 'data',
        type: 'bytes[]',
      },
    ],
    name: 'multicall',
    outputs: [
      {
        internalType: 'bytes[]',
        name: 'results',
        type: 'bytes[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'registeredTokens',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
    ],
    name: 'removeBeneficiary',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newAuthority',
        type: 'address',
      },
    ],
    name: 'setAuthority',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes4',
        name: 'interfaceId',
        type: 'bytes4',
      },
    ],
    name: 'supportsInterface',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_tokenAddress',
        type: 'address',
      },
    ],
    name: 'tokenBudget',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalClaimsAssigned',
    outputs: [
      {
        internalType: 'uint256',
        name: '_totalClaims',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_benAddress',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_vendorAddress',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_amount',
        type: 'uint256',
      },
    ],
    name: 'transferTokenToVendor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'trustedForwarder',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

@Processor(BQUEUE.CONTRACT)
export class ContractProcessor {
  private readonly logger = new Logger(ContractProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beneficiaryService: BeneficiaryService
  ) {}

  @Process({
    name: JOBS.PAYOUT.ASSIGN_TOKEN,
  })
  async processPayoutAssignToken(job: Job) {
    try {
      const payload = job.data as {
        size: number;
        start: number;
        end: number;
      };

      const benfs = await this.beneficiaryService.getBenfBetweenIds(
        payload.start,
        payload.end
      );

      const multicallTxnPayload = [];

      const contract = await this.getFromSettings('CONTRACT');
      const formatedAbi = lowerCaseObjectKeys(contract.RAHATTOKEN.ABI);

      const chainConfig = await this.getFromSettings('CHAIN_SETTINGS');

      const rpcUrl = chainConfig.rpcUrl;
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      const rahatTokenContract = new ethers.Contract(
        contract.RAHATTOKEN.ADDRESS,
        formatedAbi,
        provider
      );

      const decimal = await rahatTokenContract.decimals.staticCall();

      for (const benf of benfs) {
        if (benf.benTokens) {
          const formattedAmountBn = ethers.parseUnits(
            benf.benTokens.toString(),
            decimal
          );

          this.logger.log(
            `Contract process: Converting amount ${benf.benTokens} to formatted amount ${formattedAmountBn} for beneficiary ${benf.walletAddress} using decimal ${decimal}`
          );
          multicallTxnPayload.push([benf.walletAddress, formattedAmountBn]);
        }
      }

      const { contract: aaContract } = await this.createContractInstanceSign(
        'AAPROJECT'
      );

      const txn = await this.multiSend(
        aaContract,
        'assignTokenToBeneficiary',
        multicallTxnPayload
      );
      // await txn.wait();

      this.logger.log('contract called with txn hash:', txn.hash);
      return 'ok';
    } catch (err) {
      throw err;
    }
  }

  async createContractInstanceSign(contractName: any) {
    //  get RPC URL
    const res = await this.prisma.setting.findFirstOrThrow({
      where: {
        name: 'CHAIN_SETTINGS',
      },
      select: {
        name: true,
        value: true,
      },
    });
    const blockChainSetting = JSON.parse(JSON.stringify(res));

    //  create wallet from private key
    const provider = new JsonRpcProvider(blockChainSetting?.value?.RPCURL);
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    const wallet = new ethers.Wallet(privateKey, provider);

    const address = await this.getContractByName(contractName);

    const c = new ethers.Contract(address.ADDRESS, ABI, wallet);

    return {
      contract: c,
      provider,
      wallet,
    };
  }

  private async getFromSettings(key: string): Promise<any> {
    try {
      const settings = await this.prisma.setting.findUnique({
        where: {
          name: key,
        },
      });

      if (!settings?.value) {
        throw new Error(`${key} not found`);
      }

      return settings.value;
    } catch (error) {
      this.logger.error(`Error getting setting ${key}: ${error.message}`);
      throw error;
    }
  }

  async getContractByName(contractName: string) {
    const addresses = await this.prisma.setting.findMany({
      where: { name: 'CONTRACT' },
    });
    const address = this.findValueByKey(addresses, contractName);
    if (!address) {
      throw new Error('Contract not found');
    }
    return address;
  }

  findValueByKey(data, keyToFind) {
    // Iterate through the array of objects
    for (const obj of data) {
      // Check if the current object has a value property and if it contains the key we're looking for
      if (obj.value && obj.value.hasOwnProperty(keyToFind)) {
        // Return the value associated with the key
        return obj.value[keyToFind];
      }
    }
    // If the key is not found in any of the objects, return undefined
    return undefined;
  }

  private generateMultiCallData(
    contract: ethers.Contract,
    functionName: string,
    callData: ICallData
  ) {
    const encodedData = [];
    if (callData) {
      for (const callD of callData) {
        const encodedD = contract.interface.encodeFunctionData(functionName, [
          ...callD,
        ]);
        encodedData.push(encodedD);
      }
    }
    return encodedData;
  }

  private async multiSend(
    contract: ethers.Contract,
    functionName: string,
    callData?: ICallData
  ) {
    const encodedData = this.generateMultiCallData(
      contract,
      functionName,
      callData
    );
    const tx = await contract.multicall(encodedData);
    const result = await tx.wait();
    return result;
  }
}
