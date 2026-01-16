import { Contract, JsonRpcProvider, ethers } from 'ethers';

export { isAddress } from 'ethers';

export async function createContractInstance(contractName: any, model: any) {
  //  Get Contract
  const contract = await getContractByName(contractName, model);

  //  Get RPC URL
  const res = await model.findFirstOrThrow({
    where: {
      name: 'CHAIN_SETTINGS',
    },
    select: {
      name: true,
      value: true,
    },
  });

  //  Create Provider
  const provider = new JsonRpcProvider(res?.value?.rpcUrl);

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
  };

  const abi = contract.ABI.map(convertToLowerCase);

  //  Create an instance of the contract
  return new Contract(contract.ADDRESS, abi, provider);
}

export async function getContractByName(contractName: string, modal: any) {
  const abis = await modal.findMany({
    where: { name: 'CONTRACTS' },
  });
  const contractABI = abis[0].value[contractName];

  // const address = addresses.find((address) => address.value === contractName);
  if (!contractABI) {
    throw new Error('Contracts not found');
  }
  return contractABI;
}

export const getWalletFromPrivateKey = (privateKey: string, provider?: any) => {
  return new ethers.Wallet(privateKey, provider);
};
