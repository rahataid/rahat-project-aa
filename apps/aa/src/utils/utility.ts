import { randomBytes } from 'crypto';

export const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const lowerCaseObjectKeys = (obj: any) => {
  if (typeof obj !== 'object' || obj === null) {
    // Return the value if it's not an object
    return obj;
  }

  if (Array.isArray(obj)) {
    // Process each element in the array
    return obj.map(lowerCaseObjectKeys);
  }

  // Process each key-value pair in the object
  const lowerCaseObj: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      lowerCaseObj[key.toLowerCase()] = lowerCaseObjectKeys(obj[key]);
    }
  }
  return lowerCaseObj;
};

export const generateRandomTxHash = (wallet: string): string => {
  switch (wallet) {
    case 'stellar':
      return randomBytes(32).toString('hex');

    case 'evm':
      return '0x' + randomBytes(32).toString('hex');
    
    default:
      throw new Error(`Unsupported wallet type: ${wallet}`);
  }
};
