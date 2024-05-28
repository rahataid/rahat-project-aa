import {
  Contract,
  JsonRpcProvider,
  SignatureLike,
  ethers,
  hashMessage,
  id,
  recoverAddress,
} from 'ethers';

export { isAddress } from 'ethers';

type IStringArr = string[];
type ICallData = IStringArr[];

export const demoFunction = async (payload) => {
  console.log("payload from queu", payload);
  return "ok"
}

export const createContractInstanceSign = async (contract: any, model: any) => {
  try {
    console.log("aayo ki aayena");
    //  Get Contract
    //   const contract = await this.getContractByName(projectName);
    return "ok"
    //  Get RPC URL
    const res = await model.findFirstOrThrow({
      where: {
        name: 'BLOCKCHAIN',
      },
      select: {
        name: true,
        value: true,
      },
    });

    //  Create wallet from private key
    const provider = new JsonRpcProvider(res?.value?.RPCURL);
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


    const abi = contract.ABI.map(convertToLowerCase)
    //  Create an instance of the contract
    const contracts = new Contract(contract.ADDRESS, abi, wallet);
    return contracts
  } catch (err) {
    console.log(err);
  }
}

export async function getContractByName(contractName: string, modal: any) {

  console.log(modal)
  const addresses = await modal.findMany({
    where: { name: 'CONTRACT' },
  });


  // const address = addresses.find((address) => address.value === contractName);
  const address = findValueByKey(addresses, contractName);

  if (!address) {
    throw new Error('Contract not found');
  }
  return address;
}


function findValueByKey(data, keyToFind) {
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

