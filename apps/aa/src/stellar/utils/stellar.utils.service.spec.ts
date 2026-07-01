import { generateCSV, generateParamsHash } from './stellar.utils.service';
import { RpcException } from '@nestjs/microservices';
import * as crypto from 'crypto';

// Mock crypto module for testing
jest.mock('crypto');

describe('Stellar Utils Service', () => {
  describe('generateCSV', () => {
    const mockBeneficiaryData = [
      {
        phone: '+1234567890',
        walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        amount: '100.50',
        id: 'ben_1',
      },
      {
        phone: '+0987654321',
        walletAddress: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
        amount: '250.75',
        id: 'ben_2',
      },
    ];

    beforeEach(() => {
      // Reset console.log mock
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate CSV with correct format and headers', async () => {
      const result = await generateCSV(mockBeneficiaryData);

      expect(result).toBeInstanceOf(Buffer);
      
      const csvContent = result.toString('utf8');
      const lines = csvContent.split('\n');

      // Check header
      expect(lines[0]).toBe('phone,walletAddress,walletAddressMemo,id,amount,paymentID');
      
      // Check data rows
      expect(lines[1]).toMatch(/^"\+1234567890","GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX","\+1234567890","RECEIVER_ben_1","100.50","PAY_ben_1_\d+"$/);
      expect(lines[2]).toMatch(/^"\+0987654321","GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY","\+0987654321","RECEIVER_ben_2","250.75","PAY_ben_2_\d+"$/);
    });

    it('should handle special characters in phone numbers by escaping quotes', async () => {
      const dataWithQuotes = [
        {
          phone: '+123"456"789',
          walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '100',
          id: 'ben_test',
        },
      ];

      const result = await generateCSV(dataWithQuotes);
      const csvContent = result.toString('utf8');
      
      expect(csvContent).toContain('"+123""456""789"');
    });

    it('should handle special characters in wallet addresses by escaping quotes', async () => {
      const dataWithQuotes = [
        {
          phone: '+1234567890',
          walletAddress: 'GXXX"YYYY"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
          amount: '100',
          id: 'ben_test',
        },
      ];

      const result = await generateCSV(dataWithQuotes);
      const csvContent = result.toString('utf8');
      
      expect(csvContent).toContain('"GXXX""YYYY""ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"');
    });

    it('should handle special characters in amounts by escaping quotes', async () => {
      const dataWithQuotes = [
        {
          phone: '+1234567890',
          walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '100"test"',
          id: 'ben_test',
        },
      ];

      const result = await generateCSV(dataWithQuotes);
      const csvContent = result.toString('utf8');
      
      expect(csvContent).toContain('"100""test"""');
    });

    it('should throw RpcException for invalid amount (NaN)', async () => {
      const invalidData = [
        {
          phone: '+1234567890',
          walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: 'invalid_amount',
          id: 'ben_invalid',
        },
      ];

      await expect(generateCSV(invalidData)).rejects.toThrow(RpcException);
      await expect(generateCSV(invalidData)).rejects.toThrow(
        'Invalid amount for beneficiary ben_invalid: must be greater than 1'
      );
    });

    it('should throw RpcException for amount less than 1', async () => {
      const lowAmountData = [
        {
          phone: '+1234567890',
          walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '0.5',
          id: 'ben_low',
        },
      ];

      await expect(generateCSV(lowAmountData)).rejects.toThrow(RpcException);
      await expect(generateCSV(lowAmountData)).rejects.toThrow(
        'Invalid amount for beneficiary ben_low: must be greater than 1'
      );
    });

    it('should throw RpcException for amount equal to 0', async () => {
      const zeroAmountData = [
        {
          phone: '+1234567890',
          walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '0',
          id: 'ben_zero',
        },
      ];

      await expect(generateCSV(zeroAmountData)).rejects.toThrow(RpcException);
      await expect(generateCSV(zeroAmountData)).rejects.toThrow(
        'Invalid amount for beneficiary ben_zero: must be greater than 1'
      );
    });

    it('should handle empty array input', async () => {
      const result = await generateCSV([]);
      const csvContent = result.toString('utf8');
      
      expect(csvContent).toBe('phone,walletAddress,walletAddressMemo,id,amount,paymentID\n');
    });

    it('should generate unique payment IDs for each beneficiary', async () => {
      const result = await generateCSV(mockBeneficiaryData);
      const csvContent = result.toString('utf8');
      const lines = csvContent.split('\n');

      // Extract payment IDs from both rows
      const paymentId1Match = lines[1].match(/"PAY_ben_1_(\d+)"/);
      const paymentId2Match = lines[2].match(/"PAY_ben_2_(\d+)"/);

      expect(paymentId1Match).toBeTruthy();
      expect(paymentId2Match).toBeTruthy();
      
      // Payment IDs should be different (very unlikely to be the same with random generation)
      expect(paymentId1Match[1]).not.toBe(paymentId2Match[1]);
    });

    it('should generate proper receiver IDs', async () => {
      const result = await generateCSV(mockBeneficiaryData);
      const csvContent = result.toString('utf8');
      
      expect(csvContent).toContain('"RECEIVER_ben_1"');
      expect(csvContent).toContain('"RECEIVER_ben_2"');
    });

    it('should log the CSV content', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await generateCSV(mockBeneficiaryData);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('phone,walletAddress,walletAddressMemo,id,amount,paymentID'));
    });

    it('should handle generic errors and wrap them in RpcException', async () => {
      // Mock Buffer.from to throw an error
      const originalBufferFrom = Buffer.from;
      Buffer.from = jest.fn().mockImplementation(() => {
        throw new Error('Buffer creation failed');
      });

      await expect(generateCSV(mockBeneficiaryData)).rejects.toThrow(RpcException);
      await expect(generateCSV(mockBeneficiaryData)).rejects.toThrow('Buffer creation failed');

      // Restore original Buffer.from
      Buffer.from = originalBufferFrom;
    });

    it('should handle errors without message and use default message', async () => {
      // Mock Buffer.from to throw an error without message
      const originalBufferFrom = Buffer.from;
      Buffer.from = jest.fn().mockImplementation(() => {
        const error = new Error();
        error.message = '';
        throw error;
      });

      await expect(generateCSV(mockBeneficiaryData)).rejects.toThrow(RpcException);
      await expect(generateCSV(mockBeneficiaryData)).rejects.toThrow('Something went wrong while generating CSV');

      // Restore original Buffer.from
      Buffer.from = originalBufferFrom;
    });
  });

  describe('generateParamsHash', () => {
    const mockCrypto = {
      createHash: jest.fn(),
      update: jest.fn(),
      digest: jest.fn(),
    };

    beforeEach(() => {
      // Reset crypto mocks
      mockCrypto.digest.mockReturnValue('mocked_hash_value');
      mockCrypto.update.mockReturnValue(mockCrypto);
      mockCrypto.createHash.mockReturnValue(mockCrypto);
      (crypto.createHash as jest.Mock).mockReturnValue(mockCrypto);
    });

    it('should generate hash for simple object', () => {
      const params = {
        name: 'test',
        value: 123,
        active: true,
      };

      const result = generateParamsHash(params);

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{"active":true,"name":"test","value":123}');
      expect(mockCrypto.digest).toHaveBeenCalledWith('hex');
      expect(result).toBe('mocked_hash_value');
    });

    it('should sort object keys before hashing', () => {
      const params = {
        zebra: 'last',
        alpha: 'first', 
        beta: 'second',
      };

      generateParamsHash(params);

      // Verify that keys are sorted alphabetically in the serialized string
      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{"alpha":"first","beta":"second","zebra":"last"}');
    });

    it('should handle nested objects', () => {
      const params = {
        user: {
          name: 'John',
          age: 30,
        },
        config: {
          active: true,
        },
      };

      generateParamsHash(params);

      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{"config":{"active":true},"user":{"name":"John","age":30}}');
    });

    it('should handle arrays in parameters', () => {
      const params = {
        users: ['Alice', 'Bob', 'Charlie'],
        numbers: [3, 1, 2],
      };

      generateParamsHash(params);

      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{"numbers":[3,1,2],"users":["Alice","Bob","Charlie"]}');
    });

    it('should handle empty object', () => {
      const params = {};

      generateParamsHash(params);

      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{}');
    });

    it('should handle null and undefined values', () => {
      const params = {
        nullValue: null,
        undefinedValue: undefined,
        stringValue: 'test',
      };

      generateParamsHash(params);

      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{"nullValue":null,"stringValue":"test"}');
    });

    it('should handle special characters in values', () => {
      const params = {
        message: 'Hello "World" with special chars: @#$%',
        emoji: '🎉',
      };

      generateParamsHash(params);

      expect(mockCrypto.update).toHaveBeenCalledWith('hash_salt:{"emoji":"🎉","message":"Hello \\"World\\" with special chars: @#$%"}');
    });

    it('should produce consistent output for same input', () => {
      const params = { a: 1, b: 2 };

      const result1 = generateParamsHash(params);
      const result2 = generateParamsHash(params);

      expect(result1).toBe(result2);
    });

    it('should use salt in hash generation', () => {
      const params = { test: 'value' };

      generateParamsHash(params);

      // Verify salt is prepended to the serialized params
      expect(mockCrypto.update).toHaveBeenCalledWith(expect.stringMatching(/^hash_salt:/));
    });

    it('should handle complex mixed data types', () => {
      const params = {
        string: 'text',
        number: 42,
        boolean: false,
        array: [1, 'two', { three: 3 }],
        object: {
          nested: {
            deep: 'value',
          },
        },
      };

      generateParamsHash(params);

      const expectedSerialized = '{"array":[1,"two",{"three":3}],"boolean":false,"number":42,"object":{"nested":{"deep":"value"}},"string":"text"}';
      expect(mockCrypto.update).toHaveBeenCalledWith(`hash_salt:${expectedSerialized}`);
    });
  });
}); 