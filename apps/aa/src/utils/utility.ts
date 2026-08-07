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


export const normalizeRequiredFields = (requiredFields: unknown): string[] => {
    if (Array.isArray(requiredFields)) {
        return requiredFields.map((field) => String(field));
    }

    if (typeof requiredFields !== 'string') {
        return [];
    }

    const trimmed = requiredFields.trim();

    if (!trimmed || trimmed === '{}' || trimmed === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map((field) => String(field)) : [];
    } catch {
        return [];
    }
}

// Deserializes a setting's value from its JSON-string form (as sent in the
// aa.settings.update payload) to the native type expected by Prisma.
export const parseValueForPrisma = (setting: { value: unknown; dataType: string }): unknown => {
    const { value, dataType } = setting;

    if (typeof value !== 'string') {
        return value;
    }

    if (dataType === 'OBJECT') {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    if (dataType === 'NUMBER') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }

    if (dataType === 'BOOLEAN') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    }

    return value;
}