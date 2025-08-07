import { lowerCaseObjectKeys } from './utility';

describe('Utility Functions', () => {
  describe('lowerCaseObjectKeys', () => {
    it('should convert simple object keys to lowercase', () => {
      const input = {
        FirstName: 'John',
        LastName: 'Doe',
        EMAIL: 'john@example.com',
        AGE: 30,
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        firstname: 'John',
        lastname: 'Doe',
        email: 'john@example.com',
        age: 30,
      });
    });

    it('should handle nested objects recursively', () => {
      const input = {
        User: {
          PersonalInfo: {
            FirstName: 'John',
            LastName: 'Doe',
          },
          ContactInfo: {
            EMAIL: 'john@example.com',
            PHONE: '+1234567890',
          },
        },
        Preferences: {
          Theme: 'dark',
          Language: 'EN',
        },
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        user: {
          personalinfo: {
            firstname: 'John',
            lastname: 'Doe',
          },
          contactinfo: {
            email: 'john@example.com',
            phone: '+1234567890',
          },
        },
        preferences: {
          theme: 'dark',
          language: 'EN',
        },
      });
    });

    it('should handle arrays of primitives', () => {
      const input = ['apple', 'banana', 'cherry', 123, true];

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual(['apple', 'banana', 'cherry', 123, true]);
    });

    it('should handle arrays of objects', () => {
      const input = [
        {
          Name: 'Alice',
          AGE: 25,
        },
        {
          Name: 'Bob',
          DEPARTMENT: 'Engineering',
        },
      ];

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual([
        {
          name: 'Alice',
          age: 25,
        },
        {
          name: 'Bob',
          department: 'Engineering',
        },
      ]);
    });

    it('should handle mixed arrays with objects and primitives', () => {
      const input = [
        'string',
        123,
        {
          ObjectKey: 'value',
          ANOTHER_KEY: true,
        },
        null,
        {
          NestedObject: {
            DeepKey: 'deep value',
          },
        },
      ];

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual([
        'string',
        123,
        {
          objectkey: 'value',
          another_key: true,
        },
        null,
        {
          nestedobject: {
            deepkey: 'deep value',
          },
        },
      ]);
    });

    it('should handle null values', () => {
      const result = lowerCaseObjectKeys(null);
      expect(result).toBeNull();
    });

    it('should handle undefined values', () => {
      const result = lowerCaseObjectKeys(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle primitive string values', () => {
      const result = lowerCaseObjectKeys('hello world');
      expect(result).toBe('hello world');
    });

    it('should handle primitive number values', () => {
      const result = lowerCaseObjectKeys(42);
      expect(result).toBe(42);
    });

    it('should handle primitive boolean values', () => {
      const result = lowerCaseObjectKeys(true);
      expect(result).toBe(true);
    });

    it('should handle objects with null and undefined properties', () => {
      const input = {
        ValidKey: 'valid value',
        NullKey: null,
        UndefinedKey: undefined,
        EmptyString: '',
        ZeroNumber: 0,
        FalseBoolean: false,
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        validkey: 'valid value',
        nullkey: null,
        undefinedkey: undefined,
        emptystring: '',
        zeronumber: 0,
        falseboolean: false,
      });
    });

    it('should handle empty objects', () => {
      const input = {};
      const result = lowerCaseObjectKeys(input);
      expect(result).toEqual({});
    });

    it('should handle empty arrays', () => {
      const input: any[] = [];
      const result = lowerCaseObjectKeys(input);
      expect(result).toEqual([]);
    });

    it('should handle objects with array properties', () => {
      const input = {
        UserList: [
          {
            Name: 'Alice',
            Permissions: ['READ', 'WRITE'],
          },
          {
            Name: 'Bob',
            Permissions: ['READ'],
          },
        ],
        Settings: {
          AllowedRoles: ['ADMIN', 'USER'],
          MaxUsers: 100,
        },
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        userlist: [
          {
            name: 'Alice',
            permissions: ['READ', 'WRITE'],
          },
          {
            name: 'Bob',
            permissions: ['READ'],
          },
        ],
        settings: {
          allowedroles: ['ADMIN', 'USER'],
          maxusers: 100,
        },
      });
    });

    it('should handle complex nested structures', () => {
      const input = {
        Level1: {
          Level2: {
            Level3: {
              DeepArray: [
                {
                  ItemName: 'Item 1',
                  Properties: {
                    Color: 'red',
                    SIZE: 'large',
                  },
                },
                'string item',
                123,
              ],
            },
          },
        },
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              deeparray: [
                {
                  itemname: 'Item 1',
                  properties: {
                    color: 'red',
                    size: 'large',
                  },
                },
                'string item',
                123,
              ],
            },
          },
        },
      });
    });

    it('should handle objects with special characters in keys', () => {
      const input = {
        'Key-With-Dashes': 'value1',
        'Key_With_Underscores': 'value2',
        'Key.With.Dots': 'value3',
        'Key With Spaces': 'value4',
        'Key@#$%^&*()': 'value5',
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        'key-with-dashes': 'value1',
        'key_with_underscores': 'value2',
        'key.with.dots': 'value3',
        'key with spaces': 'value4',
        'key@#$%^&*()': 'value5',
      });
    });

    it('should handle objects with numeric keys (as strings)', () => {
      const input = {
        '0': 'first',
        '1': 'second',
        '10': 'tenth',
        'A1': 'alphanumeric',
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        '0': 'first',
        '1': 'second',
        '10': 'tenth',
        'a1': 'alphanumeric',
      });
    });

    it('should preserve array indices', () => {
      const input = ['first', 'second', 'third'];
      const result = lowerCaseObjectKeys(input);
      
      expect(result).toEqual(['first', 'second', 'third']);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01');
      const input = {
        CreatedDate: date,
        ModifiedDate: new Date('2024-12-31'),
      };

      const result = lowerCaseObjectKeys(input);

      // Date objects get converted to empty objects by the recursive function
      // since they are typeof 'object' but not plain objects or arrays
      expect(result).toEqual({
        createddate: {},
        modifieddate: {},
      });
    });

    it('should handle functions', () => {
      const testFunction = () => 'test';
      const input = {
        CallbackFunction: testFunction,
        AnotherKey: 'value',
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        callbackfunction: testFunction,
        anotherkey: 'value',
      });
    });

    it('should handle objects with hasOwnProperty method override', () => {
      const input = {
        hasOwnProperty: 'overridden',
        NormalKey: 'normal value',
        constructor: 'also overridden',
      };

      // When hasOwnProperty is overridden, the function will throw an error
      // because obj.hasOwnProperty is no longer a function
      expect(() => lowerCaseObjectKeys(input)).toThrow('obj.hasOwnProperty is not a function');
    });

    it('should handle circular references by throwing stack overflow', () => {
      const input: any = {
        Name: 'Test',
        Reference: null,
      };
      input.Reference = input; // Create circular reference

      // The current implementation doesn't handle circular references
      // and will cause a maximum call stack size exceeded error
      expect(() => lowerCaseObjectKeys(input)).toThrow('Maximum call stack size exceeded');
    });

    it('should not modify the original object', () => {
      const input = {
        OriginalKey: 'original value',
        NestedObject: {
          NestedKey: 'nested value',
        },
      };
      
      const originalInput = JSON.parse(JSON.stringify(input)); // Deep copy for comparison
      const result = lowerCaseObjectKeys(input);

      // Original should be unchanged
      expect(input).toEqual(originalInput);
      
      // Result should be different
      expect(result).not.toEqual(input);
      expect(result).toEqual({
        originalkey: 'original value',
        nestedobject: {
          nestedkey: 'nested value',
        },
      });
    });

    it('should handle keys that are already lowercase', () => {
      const input = {
        alreadylowercase: 'value1',
        anotherlowercasekey: 'value2',
        MixedCaseKey: 'value3',
      };

      const result = lowerCaseObjectKeys(input);

      expect(result).toEqual({
        alreadylowercase: 'value1',
        anotherlowercasekey: 'value2',
        mixedcasekey: 'value3',
      });
    });
  });
}); 