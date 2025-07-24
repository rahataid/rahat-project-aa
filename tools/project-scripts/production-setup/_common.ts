import * as dotenv from 'dotenv';
import { uuidV4 } from 'ethers';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { ethers } from 'ethers';
import { ContractArtifacts } from '../types/contract';
dotenv.config({ path: `${__dirname}/.env.prod` });

export class commonLib {
  provider: ethers.JsonRpcProvider;
  projectUUID: string;

  constructor() {
    console.log('Network:', process.env.NETWORK_PROVIDER);
    this.provider = new ethers.JsonRpcProvider(process.env.NETWORK_PROVIDER);
    this.projectUUID = process.env.PROJECT_ID as string;
  }
  static getUUID() {
    return uuidV4(randomBytes(16));
  }
  public sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  public getDeployerWallet() {
    return new ethers.Wallet(
      process.env.DEPLOYER_PRIVATE_KEY as string,
      this.provider
    );
  }
  public async getContractArtifacts(
    contractName: string
  ): Promise<ContractArtifacts> {
    const contract = await import(`../contracts/${contractName}.json`);
    return contract;
  }
  public async deployContract(contractName: string, args: any[]) {
    const signer = this.getDeployerWallet();
    const { abi, bytecode } = await this.getContractArtifacts(contractName);
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...args);
    const address = await contract.getAddress();
    await contract.waitForDeployment();
    const txBlock = await contract.deploymentTransaction()?.getBlock();
    this.sleep(20000);
    return {
      blockNumber: txBlock?.number || 1,
      contract: new ethers.Contract(address, abi, this.provider),
      hash: contract.deploymentTransaction()?.hash,
    };
  }

  //append to deployment file

  public async writeToDeploymentFile(fileName: string, newData: any) {
    const dirPath = `${__dirname}/deployments`;
    const filePath = `${dirPath}/${fileName}.json`;

    // Ensure the directory exists
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath);
    }

    let fileData = {};
    if (existsSync(filePath)) {
      // Read and parse the existing file if it exists
      const existingData = readFileSync(filePath, { encoding: 'utf8' });
      if (existingData) fileData = JSON.parse(existingData);
    }
    fileData = { ...fileData, ...newData };
    writeFileSync(filePath, JSON.stringify(fileData, null, 2));
  }

  public async getInterface(contractName: string) {
    const abi = (await this.getContractArtifacts(contractName)).abi;
    const iface = new ethers.Interface(abi);
    return iface;
  }

  public async generateMultiCallData(
    contractName: string,
    functionName: string,
    callData: any
  ) {
    const iface = await this.getInterface(contractName);
    const encodedData: any = [];
    if (callData) {
      for (const callD of callData) {
        const encodedD = iface.encodeFunctionData(functionName, [...callD]);
        encodedData.push(encodedD);
      }
    }
    return encodedData;
  }

  public async getContracts(
    contractName: string,
    contractAddress: string,
    privateKey: string
  ) {
    const abi = (await this.getContractArtifacts(contractName)).abi;

    const wallet = new ethers.Wallet(privateKey, this.provider);

    const contract = new ethers.Contract(contractAddress, abi, wallet);
    return contract;
  }
}
