import { Contract, ContractFactory, JsonRpcProvider, ethers } from 'ethers';
import { readFileSync } from 'fs';

import { Config } from './types/config';
import { ContractArtifacts, DeployedContractsData } from './types/contract';

import * as dotenv from 'dotenv';

dotenv.config();

const privateKeys = {
  deployer: process.env.DEPLOYER_PRIVATE_KEY,
  admin: process.env.RAHAT_ADMIN_PRIVATE_KEY,
};

export class ContractLib {
  private provider: JsonRpcProvider;
  private networkSettings: Config['blockchain'];
  public deployedContracts: DeployedContractsData;
  public deployerAddress: any;
  public adminAddress: any;

  constructor() {
    const network = process.env.NETWORK_PROVIDER || 'http://127.0.0.1:8888';
    this.networkSettings = {
      rpcUrl: network,
      chainName: process.env.CHAIN_NAME || 'matic',
      chainId: Number(process.env.CHAIN_ID) || 8888,
      blockExplorerUrls: [
        process.env.BLOCK_EXPLORER_URL ||
        'https://explorer-mumbai.maticvigil.com/',
      ],
    };
    this.provider = new JsonRpcProvider(network);
    this.deployerAddress = privateKeys.deployer;
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
    const contract = require(`./contracts/${contractName}.json`);
    return contract;
  }

  public async deployContract(
    contractName: string,
    args: any[],
    depolyedContractName: string
  ) {
    const signer = new ethers.Wallet(privateKeys.deployer || '', this.provider);

    const { abi, bytecode } = this.getContractArtifacts(contractName);
    const factory = new ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...args);
    const address = await contract.getAddress();
    const t = await contract.waitForDeployment();
    await this.delay(500);

    const data = {
      contractName,
      address,
      contract: new ethers.Contract(address, abi, this.provider),
      abi,
      startBlock: contract.deploymentTransaction()?.blockNumber || 1,
    };


    return {
      blockNumber: contract.deploymentTransaction()?.blockNumber || 1,
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
    deployedContractName: string,
    contractAddressFile: string,
    signer?: ethers.Signer,
  ) {
    const contractAddress = await this.getDeployedAddress(contractAddressFile, deployedContractName);
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
    const fileData = readFileSync(`${__dirname}/${contractAddressFile}.json`, 'utf8');

    const data = JSON.parse(fileData);
    return data[contractName].address;
  }

  public async mintVouchers(
    contractName: string,
    args: any[],
    filename: string,
    signer: ethers.Wallet
  ) {
    console.log({ ...args });
    const contractAddress = await this.getDeployedAddress(filename, contractName);
    const abi = this.getContractArtifacts(contractName).abi;
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = await contract[
      'mintTokenAndApprove'
    ](...args);
    tx.wait();
    console.log(tx);
    return tx;

    // const tx = this.callContractMethod('RahatDonor', 'mintTokenAndApprove', [this.getDeployedAddress(contractName), this.getDeployedAddress('ELProject'),amount,voucherDetails],'EyeVoucher' ,deployerAccount);
    // console.log(tx);
  }

  public async getDeployedContractDetails(contractAddressFile: string, contractName: string[]) {
    const contractDetails: { [key: string]: { address: string; abi: any } } =
      {};
    contractName.map(async (contract) => {
      const address = await this.getDeployedAddress(contractAddressFile, contract);
      const { abi } = this.getContractArtifacts(contract);
      // console.log(abi)
      contractDetails[contract] = {
        address,
        abi,
      };
    });
    return contractDetails;
  }

  public async getInterface(contractName: string) {
    const abi = this.getContractArtifacts(contractName).abi;
    const iface = new ethers.Interface(abi);
    return iface;
  }

  public async getContracts(contractName: string, contractAddressFile: string, deployedContractName: string, signer?: ethers.Signer) {
    const contractAddress = await this.getDeployedAddress(contractAddressFile, deployedContractName);
    const abi = this.getContractArtifacts(contractName).abi;
    const privateKey = process.env.RAHAT_ADMIN_PRIVATE_KEY || '';

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
