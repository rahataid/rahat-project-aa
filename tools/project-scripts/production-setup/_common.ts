import { Contract, ContractFactory, JsonRpcProvider, ethers } from 'ethers';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';

import { Config } from '../types/config';
import { ContractArtifacts, DeployedContractsData } from '../types/contract';

import * as dotenv from 'dotenv';

dotenv.config();

export class ContractLib {
  private provider: JsonRpcProvider;
  private networkSettings: Config['blockchain'];
  public deployedContracts: DeployedContractsData;

  constructor() {
    const network = process.env.NETWORK_PROVIDER || ''
    this.networkSettings = {
      rpcUrl: network,
      chainName: process.env.EVM_CHAIN_NAME || '',
      chainId: process.env.EVM_CHAIN_ID || 84532,
      blockExplorerUrls: [
        '',
      ],
    };
    this.provider = new JsonRpcProvider(network);
    this.deployedContracts = {};
  }

  public getDeployedContracts(
    contractName: string
  ): DeployedContractsData[string] | DeployedContractsData {
    if (contractName) {
      const contract = this.deployedContracts[contractName];
      if (!contract) {
        throw new Error(`Contract ${contractName} not found`);
      }
      return contract;
    }
    return this.deployedContracts;
  }

  public getNetworkSettings() {
    return this.networkSettings;
  }

  public getContractArtifacts(contractName: string): ContractArtifacts {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const contract = require(`../contracts/${contractName}.json`);
    return contract;
  }

  public async deployContract(
    contractName: string,
    args: any[],
    deployerKey: string
  ) {
    const signer = new ethers.Wallet(deployerKey || '', this.provider);

    const { abi, bytecode } = this.getContractArtifacts(contractName);
    const factory = new ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...args);
    const address = await contract.getAddress();
    const txBlock = await contract.deploymentTransaction()?.getBlock();
    await this.delay(2000);

    const data = {
      contractName,
      address,
      contract: new ethers.Contract(address, abi, this.provider),
      abi,
      startBlock: txBlock?.number || 1,
    };


    return {
      blockNumber: txBlock?.number || 1,
      contract: new ethers.Contract(address, abi, this.provider),
    };
  }

  public getWalletFromPrivateKey(privateKey: string) {
    return new ethers.Wallet(privateKey, this.provider);
  }

  public delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  public async callContractMethod(
    contractName: string,
    methodName: string,
    args: any[],
    contractAddress: string,
    signer?: ethers.Signer,
  ) {
    //const contractAddress = await this.getDeployedAddress(contractAddressFile, deployedContractName);
    const abi = this.getContractArtifacts(contractName).abi;
    // const contractData = this.deployedContracts[contractName];
    if (!contractAddress) {
      throw new Error(`Contract ${contractName} not deployed`);
    }

    const contract = new ethers.Contract(
      contractAddress,
      abi,
      signer || this.provider
    );

    const method = contract[methodName];
    if (!method) {
      throw new Error(
        `Method ${methodName} not found in contract ${contractName}`
      );
    }

    const result = await method(...args);
    await this.delay(3000)
    return result;
  }

  public getDeployedAddress(contractAddressFile: string, contractName: string) {
    const fileData = readFileSync(`${__dirname}/deployments/${contractAddressFile}.json`, 'utf8');

    const data = JSON.parse(fileData);
    console.log({ data })
    console.log({ contractName })
    return data[contractName].address;
  }

  public async mintVouchers(
    contractName: string,
    args: any[],
    filename: string,
    signer: ethers.Wallet
  ) {
    const contractAddress = await this.getDeployedAddress(filename, contractName);
    const abi = this.getContractArtifacts(contractName).abi;
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = await contract[
      'mintTokenAndApprove'
    ](...args);
    tx.wait();
    console.log(tx);
    return tx;
  }

  public async getDeployedContractDetails(contractAddressFile: string, contractName: string[]) {
    const contractDetails: { [key: string]: { address: string; abi: any } } =
      {};
    contractName.map(async (contract) => {
      const address = await this.getDeployedAddress(contractAddressFile, contract);
      const { abi } = this.getContractArtifacts(contract);
      contractDetails[contract] = {
        address,
        abi,
      };
    });
    return contractDetails;
  }

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
    console.log({ fileData })
    writeFileSync(filePath, JSON.stringify(fileData, null, 2));
  }

  public async getInterface(contractName: string) {
    const abi = this.getContractArtifacts(contractName).abi;
    const iface = new ethers.Interface(abi);
    return iface;
  }

  public async getContracts(contractName: string, contractAddress: string, privateKey: string) {
    const abi = this.getContractArtifacts(contractName).abi;

    const wallet = new ethers.Wallet(privateKey, this.provider);


    const contract = new Contract(
      contractAddress,
      abi,
      wallet
    )
    return contract;

  }

  public async generateMultiCallData(contractName: string, functionName: string, callData: any) {
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
}
