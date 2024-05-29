import {
  Contract,
  InterfaceAbi,
  TransactionReceipt,
  TransactionResponse,
} from "ethers";

export interface ContractArtifacts {
  contractName: string;
  bytecode: string;
  abi: InterfaceAbi;
}

export type DeployedContractsData = {
  [key: string]: {
    contractName: string;
    address: string;
    contract: Contract;
    abi: InterfaceAbi;
    startBlock: number;
  };
};
