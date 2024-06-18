import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, JOBS } from '../constants';
import { Job } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import { JsonRpcProvider, ethers } from 'ethers';

type IStringArr = string[] 
type ICallData = IStringArr[]

@Processor(BQUEUE.CONTRACT)
export class ContractProcessor {
  private readonly logger = new Logger(ContractProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  @Process({
    name: JOBS.PAYOUT.ASSIGN_TOKEN,
    concurrency: 1
  })
  async processPayoutAssignToken(job: Job) {
    try {
      const payload = job.data as {
        benTokens: number;
        wallet: string
      }

      const { contract: aaContract, provider, wallet } = await this.createContractInstanceSign('AAPROJECT')
      // const gasPrice = ethers.parseUnits('500', 'gwei')

      // let gasPrice = (await provider.getFeeData()).maxPriorityFeePerGas
      // if (!gasPrice) {
      //   gasPrice = ethers.parseUnits('1000', 'gwei'); // Fallback gas price
      // }

      // const nonce = await provider.getTransactionCount(wallet.address, 'latest');

      // console.log("Using gas:", gasPrice);
      // console.log("Using nonce:", nonce);
      // const multicallData = this.generateMultiCallData(aaContract,'assignTokenToBeneficiary',[
      //   // ['wallet','tokens'],
      // ])


      const txn = await aaContract.assignTokenToBeneficiary(payload.wallet, payload.benTokens);
      // await txn.wait();
      // const txn = await this.multiSend(
      //   aaContract,
      //   'assignTokenToBeneficiary',
      //   // ['wa']
      // )

      this.logger.log("contract called with txn hash:", txn.hash);
      return "ok"
    } catch (err) {
      throw err
    }
  }

  async createContractInstanceSign(contractName: any) {
    //  get RPC URL
    const res = await this.prisma.setting.findFirstOrThrow({
      where: {
        name: 'BLOCKCHAIN',
      },
      select: {
        name: true,
        value: true,
      },
    });
    const blockChainSetting = JSON.parse(JSON.stringify(res))

    //  create wallet from private key
    const provider = new JsonRpcProvider(blockChainSetting?.value?.RPCURL);
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    const wallet = new ethers.Wallet(privateKey, provider);

    const convertToLowerCase = (obj) => {
      const newObj = {};
      for (const key in obj) {
        const newKey = key.toLowerCase();
        const value = obj[key];
        if (Array.isArray(value)) {
          newObj[newKey] = value.map(convertToLowerCase);
        } else if (typeof value === 'object') {
          newObj[newKey] = convertToLowerCase(value);
        } else {
          newObj[newKey] = value;
        }
      }
      return newObj;
    }

    const contract = await this.getContractByName(contractName)
    const abi = contract.ABI.map(convertToLowerCase)
    //  create an instance of the contract
    const c = new ethers.Contract(contract.ADDRESS, abi, wallet);
    return {
      contract: c,
      provider,
      wallet
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
