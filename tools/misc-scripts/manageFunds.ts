import { PrismaService } from '@rumsan/prisma';
import { log } from 'console';
import * as dotenv from 'dotenv';
dotenv.config();
import { JsonRpcProvider, ethers } from 'ethers';

const prisma = new PrismaService();

type IStringArr = string[];
type ICallData = IStringArr[];

type Batch = { size: number; start: number; end: number };

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

function createBatches(total: number, batchSize: number, start = 1) {
  const batches: { size: number, start: number, end: number }[] = [];
  let elementsRemaining = total; // Track remaining elements to batch

  while (elementsRemaining > 0) {
    const end = start + Math.min(batchSize, elementsRemaining) - 1;
    const currentBatchSize = end - start + 1;

    batches.push({
      size: currentBatchSize,
      start: start,
      end: end,
    });

    elementsRemaining -= currentBatchSize; // Subtract batched elements
    start = end + 1; // Move start to the next element
  }

  return batches;
}

const main = async () => {
  const benfCount = await prisma.beneficiary.count({
    where: {
      deletedAt: null,
    },
  });


  const batches = createBatches(benfCount, 20, 547);

  // console.log(batches.length)

  // return 

  let counter = 0;

  for (const batch of batches) {
    const benfs = await prisma.beneficiary.findMany({
      where: {
        id: {
          gte: batch.start,
          lte: batch.end,
        },
      },
    });
    // console.log(batch, benfs);
    // process.exit(1);

    // const multicallTxnPayload = [];

    const multicallTxnPayload: any[] = [];

    for (const benf of benfs) {
      //   console.log(benf.walletAddress, benf.benTokens);

      if (benf.benTokens) {
        multicallTxnPayload.push([benf.walletAddress, benf.benTokens]);
      }
    }

    const { contract: aaContract } = await createContractInstanceSign(
      'AAPROJECT'
    );

    const txn = await multiSend(
      aaContract,
      'assignTokenToBeneficiary',
      multicallTxnPayload
    );

    console.log('contract called with txn hash:', txn);
    counter++
    console.log(counter)
  }
};

async function createContractInstanceSign(contractName: any) {
  //  get RPC URL
  const res = await prisma.setting.findFirstOrThrow({
    where: {
      name: 'BLOCKCHAIN',
    },
    select: {
      name: true,
      value: true,
    },
  });
  const blockChainSetting = JSON.parse(JSON.stringify(res));

  //  create wallet from private key
  const provider = new JsonRpcProvider(blockChainSetting?.value?.RPCURL);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as string;

  const wallet = new ethers.Wallet(privateKey, provider);

  const address = await getContractByName(contractName);

  const c = new ethers.Contract(address.ADDRESS, ABI, wallet);
  return {
    contract: c,
    provider,
    wallet,
  };
}

async function generateMultiCallData(
  contract: ethers.Contract,
  functionName: string,
  callData: ICallData
) {
  const encodedData: string[] = [];
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

async function multiSend(
  contract: ethers.Contract,
  functionName: string,
  callData: ICallData
) {
  const encodedData = await generateMultiCallData(
    contract,
    functionName,
    callData
  );

  //   console.log('encoded data', encodedData);

  const tx = await contract.multicall(encodedData);
  const result = await tx.wait();

  return result;

  //   return 'ok';
}

async function getContractByName(contractName: string) {
  const addresses = await prisma.setting.findMany({
    where: { name: 'CONTRACT' },
  });

  const address = findValueByKey(addresses, contractName);

  if (!address) {
    throw new Error('Contract not found');
  }
  return address;
}

function findValueByKey(data: any, keyToFind: any) {
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
