import { validate } from 'class-validator';
import { PaginationBaseDto, RequiredAndOptionalKeys } from './common';

describe('Common', () => {
  describe('PaginationBaseDto', () => {
    it('should validate a complete PaginationBaseDto object', async () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 20;
      dto.sort = 'name';
      dto.order = 'asc';
      dto.search = 'test';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate PaginationBaseDto with minimal required fields', async () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 10;
      dto.sort = 'createdAt';
      dto.order = 'desc';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid order values', async () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 20;
      dto.sort = 'name';
      dto.order = 'asc';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);

      dto.order = 'desc';
      const errors2 = await validate(dto);
      expect(errors2).toHaveLength(0);
    });

    it('should allow optional search parameter', async () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 20;
      dto.sort = 'name';
      dto.order = 'asc';
      // search is optional, so not setting it should be valid

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should allow optional sort parameter', async () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 20;
      dto.order = 'asc';
      // sort is optional, so not setting it should be valid

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should allow optional order parameter', async () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 20;
      dto.sort = 'name';
      // order is optional, so not setting it should be valid

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should have correct property types', () => {
      const dto = new PaginationBaseDto();
      dto.page = 1;
      dto.perPage = 20;
      dto.sort = 'name';
      dto.order = 'asc';
      dto.search = 'test';

      expect(typeof dto.page).toBe('number');
      expect(typeof dto.perPage).toBe('number');
      expect(typeof dto.sort).toBe('string');
      expect(typeof dto.order).toBe('string');
      expect(typeof dto.search).toBe('string');
    });
  });

  describe('RequiredAndOptionalKeys type', () => {
    interface TestInterface {
      id: number;
      name: string;
      email: string;
      age: number;
      isActive: boolean;
    }

    it('should correctly type required and optional keys', () => {
      // Test that the type works correctly by creating objects
      type TestType = RequiredAndOptionalKeys<TestInterface, 'id' | 'name'>;

      // This should compile - id and name are required, others optional
      const validObject: TestType = {
        id: 1,
        name: 'John Doe',
        // email, age, isActive are optional
      };

      expect(validObject.id).toBe(1);
      expect(validObject.name).toBe('John Doe');
    });

    it('should allow optional fields in RequiredAndOptionalKeys', () => {
      type TestType = RequiredAndOptionalKeys<TestInterface, 'id'>;

      const validObject: TestType = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        // age and isActive are optional
      };

      expect(validObject.id).toBe(1);
      expect(validObject.name).toBe('John');
      expect(validObject.email).toBe('john@example.com');
    });

    it('should work with empty required keys', () => {
      type TestType = RequiredAndOptionalKeys<TestInterface, never>;

      // All fields should be optional
      const validObject: TestType = {
        name: 'Jane',
        // All other fields are optional
      };

      expect(validObject.name).toBe('Jane');
    });

    it('should work with all keys required', () => {
      type TestType = RequiredAndOptionalKeys<TestInterface, keyof TestInterface>;

      // All fields should be required
      const validObject: TestType = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        age: 30,
        isActive: true,
      };

      expect(validObject.id).toBe(1);
      expect(validObject.name).toBe('John');
      expect(validObject.email).toBe('john@example.com');
      expect(validObject.age).toBe(30);
      expect(validObject.isActive).toBe(true);
    });
  });
}); 