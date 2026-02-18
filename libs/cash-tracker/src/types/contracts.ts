// Contract-specific types based on SmartAccount and CashToken contracts

export interface SmartAccountContract {
  address: string;
  owner: () => Promise<string>;
  getEntryPoint: () => Promise<string>;
  execute: (dest: string, value: bigint, data: string) => Promise<any>;
  validateUserOp: (
    userOp: any,
    userOpHash: string,
    missingAccountFunds: bigint
  ) => Promise<bigint>;
}

export interface CashTokenContract {
  address: string;
  name: () => Promise<string>;
  symbol: () => Promise<string>;
  decimals: () => Promise<number>;
  totalSupply: () => Promise<bigint>;
  balanceOf: (account: string) => Promise<bigint>;
  allowance: (owner: string, spender: string) => Promise<bigint>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  transfer: (to: string, amount: bigint) => Promise<any>;
  transferFrom: (from: string, to: string, amount: bigint) => Promise<any>;
  mint: (to: string, amount: bigint) => Promise<any>;
  burn: (from: string, amount: bigint) => Promise<any>;
}

// Contract Events
export interface TransferEvent {
  from: string;
  to: string;
  value: bigint;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface ApprovalEvent {
  owner: string;
  spender: string;
  value: bigint;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface OwnershipTransferredEvent {
  previousOwner: string;
  newOwner: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

// Contract ABIs (simplified for type safety)
export interface SmartAccountABI {
  // Core functions
  execute: {
    inputs: [
      { name: "dest"; type: "address" },
      { name: "value"; type: "uint256" },
      { name: "functionData"; type: "bytes" }
    ];
    outputs: [];
    stateMutability: "nonpayable";
  };
  validateUserOp: {
    inputs: [
      { name: "userOp"; type: "tuple" },
      { name: "userOpHash"; type: "bytes32" },
      { name: "missingAccountFunds"; type: "uint256" }
    ];
    outputs: [{ name: "validationData"; type: "uint256" }];
    stateMutability: "nonpayable";
  };
  getEntryPoint: {
    inputs: [];
    outputs: [{ name: ""; type: "address" }];
    stateMutability: "view";
  };
}

export interface CashTokenABI {
  // ERC20 functions
  balanceOf: {
    inputs: [{ name: "account"; type: "address" }];
    outputs: [{ name: ""; type: "uint256" }];
    stateMutability: "view";
  };
  allowance: {
    inputs: [
      { name: "owner"; type: "address" },
      { name: "spender"; type: "address" }
    ];
    outputs: [{ name: ""; type: "uint256" }];
    stateMutability: "view";
  };
  approve: {
    inputs: [
      { name: "spender"; type: "address" },
      { name: "amount"; type: "uint256" }
    ];
    outputs: [{ name: ""; type: "bool" }];
    stateMutability: "nonpayable";
  };
  transfer: {
    inputs: [
      { name: "to"; type: "address" },
      { name: "amount"; type: "uint256" }
    ];
    outputs: [{ name: ""; type: "bool" }];
    stateMutability: "nonpayable";
  };
  transferFrom: {
    inputs: [
      { name: "from"; type: "address" },
      { name: "to"; type: "address" },
      { name: "amount"; type: "uint256" }
    ];
    outputs: [{ name: ""; type: "bool" }];
    stateMutability: "nonpayable";
  };
  // Custom functions
  mint: {
    inputs: [
      { name: "to"; type: "address" },
      { name: "amount"; type: "uint256" }
    ];
    outputs: [];
    stateMutability: "nonpayable";
  };
  burn: {
    inputs: [
      { name: "from"; type: "address" },
      { name: "amount"; type: "uint256" }
    ];
    outputs: [];
    stateMutability: "nonpayable";
  };
}

// Contract deployment types
export interface ContractDeploymentConfig {
  name: string;
  abi: any;
  bytecode: string;
  constructorArgs: any[];
  gasLimit?: bigint;
  gasPrice?: bigint;
}

export interface DeployedContract {
  address: string;
  name: string;
  abi: any;
  deploymentTx: string;
  blockNumber: number;
  constructorArgs: any[];
}
