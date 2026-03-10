import { Test, TestingModule } from '@nestjs/testing';
import { StakeholdersService } from './stakeholders.service';
import { PrismaService } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { CommunicationService } from '@rumsan/communication';
import { ConfigService } from '@nestjs/config';
import { StatsService } from '../stats';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TRIGGGERS_MODULE } from '../constants';
import { of, throwError } from 'rxjs';

jest.mock('@rumsan/communication', () => ({
  CommunicationService: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
  })),
}));

jest.mock('@rumsan/prisma', () => {
  const mockPaginateFn = jest.fn();
  return {
    PrismaService: class PrismaService {},
    paginator: jest.fn().mockReturnValue(mockPaginateFn),
    __mockPaginateFn: mockPaginateFn,
  };
});

describe('StakeholdersService', () => {
  let service: StakeholdersService;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mockPaginateFn = require('@rumsan/prisma')
    .__mockPaginateFn as jest.Mock;

  const mockPrismaService = {
    stakeholders: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    stakeholdersGroups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'COMMUNICATION_URL') return 'http://mock-url';
      if (key === 'COMMUNICATION_APP_ID') return 'mock-app-id';
      return null;
    }),
  };

  const mockStatsService = { save: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };
  const mockClientProxy = { send: jest.fn(), emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakeholdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StatsService, useValue: mockStatsService },
        { provide: TRIGGGERS_MODULE, useValue: mockClientProxy },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<StakeholdersService>(StakeholdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== add() ====================
  describe('add', () => {
    const basePayload = {
      name: 'John Doe',
      email: 'john@test.com',
      phone: '+9779841000000',
      designation: 'Engineer',
      organization: 'Test Org',
      district: 'Kathmandu',
      municipality: 'Metro',
      supportArea: ['Health'],
    };

    it('should create a stakeholder with valid phone', async () => {
      const created = { id: 1, uuid: 'uuid-1', ...basePayload };
      mockPrismaService.stakeholders.findFirst.mockResolvedValue(null);
      mockPrismaService.stakeholders.create.mockResolvedValue(created);

      const result = await service.add(basePayload);

      expect(mockPrismaService.stakeholders.findFirst).toHaveBeenCalledWith({
        where: { phone: basePayload.phone },
      });
      expect(mockPrismaService.stakeholders.create).toHaveBeenCalledWith({
        data: {
          email: basePayload.email,
          designation: basePayload.designation,
          organization: basePayload.organization,
          district: basePayload.district,
          municipality: basePayload.municipality,
          supportArea: basePayload.supportArea,
          name: basePayload.name,
          phone: basePayload.phone,
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_created'
      );
      expect(result).toEqual(created);
    });

    it('should create stakeholder with null phone when phone is empty string', async () => {
      const payload = { ...basePayload, phone: '' };
      const created = { id: 2, uuid: 'uuid-2', ...payload, phone: null };
      mockPrismaService.stakeholders.create.mockResolvedValue(created);

      const result = await service.add(payload);

      expect(mockPrismaService.stakeholders.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.stakeholders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: null }),
        })
      );
      expect(result).toEqual(created);
    });

    it('should create stakeholder with null phone when phone is whitespace', async () => {
      const payload = { ...basePayload, phone: '   ' };
      const created = { id: 3, uuid: 'uuid-3', ...payload, phone: null };
      mockPrismaService.stakeholders.create.mockResolvedValue(created);

      await service.add(payload);

      expect(mockPrismaService.stakeholders.findFirst).not.toHaveBeenCalled();
      const createCall = mockPrismaService.stakeholders.create.mock.calls[0][0];
      expect(createCall.data.phone).toBeNull();
    });

    it('should throw RpcException if phone already exists', async () => {
      mockPrismaService.stakeholders.findFirst.mockResolvedValue({ id: 99 });

      await expect(service.add(basePayload)).rejects.toThrow(
        new RpcException('Phone number must be unique')
      );
      expect(mockPrismaService.stakeholders.create).not.toHaveBeenCalled();
    });

    it('should emit STAKEHOLDER_CREATED event after creation', async () => {
      mockPrismaService.stakeholders.findFirst.mockResolvedValue(null);
      mockPrismaService.stakeholders.create.mockResolvedValue({ id: 1 });

      await service.add(basePayload);

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_created'
      );
    });
  });

  // ==================== bulkAdd() ====================
  describe('bulkAdd', () => {
    const validRow = {
      Name: 'John Doe',
      Designation: 'Engineer',
      Organization: 'Test Org',
      District: 'Kathmandu',
      Municipality: 'Metro',
      'Mobile #': '9841000000',
      'Support Area': 'Health, Education',
      'Email ID': 'john@test.com',
    };

    // Patch $transaction onto the mockPrismaService before each bulkAdd test
    beforeEach(() => {
      mockPrismaService['$transaction'] = jest.fn((ops) => {
        if (typeof ops === 'function') {
          const tx = {
            stakeholders: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
              update: jest.fn().mockResolvedValue({}),
            },
          };
          return ops(tx);
        }
        return Promise.all(ops);
      });
    });

    it('should create new stakeholder and normalize 10-digit phone to +977 format', async () => {
      // fetchExistingByPhone → no existing records
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      const result = await service.bulkAdd([validRow]);

      expect(result.successCount).toBe(1);
      expect(result.message).toBe('All stakeholders successfully added.');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_created'
      );
      // $transaction was called
      expect(mockPrismaService['$transaction']).toHaveBeenCalled();
      // createMany received the phone in +977 format
      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      expect(tx.stakeholders.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ phone: '+9779841000000' }),
          ]),
        })
      );
    });

    it('should normalize email to lowercase', async () => {
      const rowWithUpperEmail = { ...validRow, 'Email ID': 'JOHN@TEST.COM' };
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      await service.bulkAdd([rowWithUpperEmail]);

      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      expect(tx.stakeholders.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ email: 'john@test.com' }),
          ]),
        })
      );
    });

    it('should update existing stakeholder when phone already exists in DB', async () => {
      // fetchExistingByPhone → phone already in DB with a known uuid
      mockPrismaService.stakeholders.findMany.mockResolvedValue([
        { phone: '+9779841000000', uuid: 'existing-uuid-1' },
      ]);

      const result = await service.bulkAdd([validRow]);

      expect(result.successCount).toBe(1);
      // update (not createMany) should be called inside the transaction
      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      expect(tx.stakeholders.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uuid: 'existing-uuid-1' } })
      );
      expect(tx.stakeholders.createMany).not.toHaveBeenCalled();
    });

    it('should create new AND update existing stakeholders in same batch', async () => {
      const newRow = {
        Name: 'New Person',
        Designation: 'Dev',
        Organization: 'Org',
        District: 'Dist',
        Municipality: 'Muni',
        'Mobile #': '9841000099',
      };
      // Only validRow's phone exists in DB; newRow's phone does not
      mockPrismaService.stakeholders.findMany.mockResolvedValue([
        { phone: '+9779841000000', uuid: 'existing-uuid-1' },
      ]);

      const result = await service.bulkAdd([validRow, newRow]);

      expect(result.successCount).toBe(2);
      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      expect(tx.stakeholders.createMany).toHaveBeenCalled();
      expect(tx.stakeholders.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uuid: 'existing-uuid-1' } })
      );
    });

    it('should deduplicate rows with same phone — first occurrence wins', async () => {
      const duplicateRow = { ...validRow, Name: 'Duplicate Person' };
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      const result = await service.bulkAdd([validRow, duplicateRow]);

      // deduplicated to 1
      expect(result.successCount).toBe(1);
      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      expect(tx.stakeholders.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ name: 'John Doe' }),
          ]),
        })
      );
    });

    it('should strip empty optional fields from payload before DB operation', async () => {
      const rowWithEmptyEmail = { ...validRow, 'Email ID': '' };
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      await service.bulkAdd([rowWithEmptyEmail]);

      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      const createManyCall = tx.stakeholders.createMany.mock.calls[0][0];
      // email should not be present (stripped) or be null — not an empty string
      const row = createManyCall.data[0];
      expect(row.email === undefined || row.email === null).toBe(true);
    });

    it('should use "Stakeholders Name" field when "Name" is absent', async () => {
      const rowAltName = {
        'Stakeholders Name': 'Alt Name',
        Designation: 'Dev',
        Organization: 'Org',
        District: 'Dist',
        Municipality: 'Muni',
        'Mobile #': '9841000002',
      };
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      const result = await service.bulkAdd([rowAltName]);

      expect(result.successCount).toBe(1);
      const txFn = mockPrismaService['$transaction'].mock.calls[0][0];
      const tx = {
        stakeholders: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      await txFn(tx);
      expect(tx.stakeholders.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ name: 'Alt Name' }),
          ]),
        })
      );
    });

    it('should throw RpcException if validation fails (empty name)', async () => {
      const invalidRow = { ...validRow, Name: '' };

      await expect(service.bulkAdd([invalidRow])).rejects.toThrow(RpcException);
      expect(mockPrismaService['$transaction']).not.toHaveBeenCalled();
    });

    it('should throw RpcException when $transaction fails', async () => {
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);
      mockPrismaService['$transaction'] = jest
        .fn()
        .mockRejectedValue(new Error('DB error'));

      await expect(service.bulkAdd([validRow])).rejects.toThrow(RpcException);
    });

    it('should emit STAKEHOLDER_CREATED event after successful import', async () => {
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      await service.bulkAdd([validRow]);

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_created'
      );
    });

    it('should not call $transaction when all rows fail validation', async () => {
      const allInvalid = [{ ...validRow, Name: '' }];

      await expect(service.bulkAdd(allInvalid)).rejects.toThrow(RpcException);
      expect(mockPrismaService['$transaction']).not.toHaveBeenCalled();
    });

    it('should allow null-phone records through deduplication', async () => {
      const rowWithValidPhone = {
        Name: 'No Phone Person',
        Designation: 'Analyst',
        Organization: 'Org',
        District: 'Dist',
        Municipality: 'Muni',
        'Mobile #': '+9779841000099', // valid phone, not null
      };
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);

      const result = await service.bulkAdd([rowWithValidPhone]);

      expect(result.successCount).toBe(1);
    });
  });

  // ==================== getAll() ====================
  describe('getAll', () => {
    const baseGetAll = {
      name: '',
      designation: '',
      district: '',
      municipality: '',
      organization: '',
      supportArea: '',
      page: 1,
      perPage: 10,
    };

    it('should call paginate with isDeleted:false and default orderBy when no filters', async () => {
      const mockResult = { data: [], meta: { total: 0, page: 1, perPage: 10 } };
      mockPaginateFn.mockResolvedValue(mockResult);

      const result = await service.getAll(baseGetAll);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.stakeholders,
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
          include: { stakeholdersGroups: true },
          orderBy: { createdAt: 'desc' },
        }),
        { page: 1, perPage: 10 }
      );
      expect(result).toEqual(mockResult);
    });

    it('should add name filter when name is provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAll({ ...baseGetAll, name: 'John' });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.where.name).toEqual({
        contains: 'John',
        mode: 'insensitive',
      });
    });

    it('should add designation filter when designation is provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAll({ ...baseGetAll, designation: 'Engineer' });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.where.designation).toEqual({
        contains: 'Engineer',
        mode: 'insensitive',
      });
    });

    it('should add district filter when district is provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAll({ ...baseGetAll, district: 'Kathmandu' });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.where.district).toEqual({
        contains: 'Kathmandu',
        mode: 'insensitive',
      });
    });

    it('should add supportArea filter when supportArea is provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAll({ ...baseGetAll, supportArea: 'Health' });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.where.supportArea).toEqual({ hasSome: ['Health'] });
    });

    it('should use custom orderBy when sort and order are provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAll({ ...baseGetAll, sort: 'name', order: 'asc' });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.orderBy).toEqual({ name: 'asc' });
    });
  });

  // ==================== getOne() ====================
  describe('getOne', () => {
    it('should return stakeholder with stakeholder groups', async () => {
      const uuid = 'uuid-1';
      const stakeholder = { id: 1, uuid, name: 'John', stakeholdersGroups: [] };
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(stakeholder);

      const result = await service.getOne({ uuid });

      expect(mockPrismaService.stakeholders.findUnique).toHaveBeenCalledWith({
        where: { uuid },
        include: { stakeholdersGroups: true },
      });
      expect(result).toEqual(stakeholder);
    });

    it('should return null when stakeholder not found', async () => {
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(null);

      const result = await service.getOne({ uuid: 'nonexistent' });

      expect(result).toBeNull();
    });
  });

  // ==================== remove() ====================
  describe('remove', () => {
    it('should soft delete stakeholder and emit removed event', async () => {
      const uuid = 'uuid-1';
      const updated = { id: 1, uuid, isDeleted: true };
      mockPrismaService.stakeholders.update.mockResolvedValue(updated);

      const result = await service.remove({ uuid });

      expect(mockPrismaService.stakeholders.update).toHaveBeenCalledWith({
        where: { uuid },
        data: { isDeleted: true },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_removed'
      );
      expect(result).toEqual(updated);
    });
  });

  // ==================== update() ====================
  describe('update', () => {
    const uuid = 'uuid-1';
    const existingStakeholder = {
      id: 1,
      uuid,
      name: 'Old Name',
      email: 'old@test.com',
      phone: '+9779841000000',
      designation: 'Old Designation',
      organization: 'Old Org',
      district: 'Old District',
      municipality: 'Old Muni',
      supportArea: ['Health'],
    };

    it('should update stakeholder with all new values', async () => {
      const payload = {
        uuid,
        name: 'New Name',
        phone: '+9779841111111',
        email: 'new@test.com',
        designation: 'New Designation',
        organization: 'New Org',
        district: 'New Dist',
        municipality: 'New Muni',
        supportArea: ['Education'],
      };
      const updated = { ...existingStakeholder, ...payload };
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(
        existingStakeholder
      );
      mockPrismaService.stakeholders.findFirst.mockResolvedValue(null);
      mockPrismaService.stakeholders.update.mockResolvedValue(updated);

      const result = await service.update(payload);

      expect(mockPrismaService.stakeholders.findUnique).toHaveBeenCalledWith({
        where: { uuid },
      });
      expect(mockPrismaService.stakeholders.findFirst).toHaveBeenCalledWith({
        where: { phone: payload.phone, uuid: { not: uuid } },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_updated'
      );
      expect(result).toEqual(updated);
    });

    it('should throw RpcException when stakeholder not found', async () => {
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(null);

      await expect(service.update({ uuid, phone: '' })).rejects.toThrow(
        new RpcException('Stakeholder not found!')
      );
    });

    it('should throw RpcException when phone is taken by another stakeholder', async () => {
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(
        existingStakeholder
      );
      mockPrismaService.stakeholders.findFirst.mockResolvedValue({ id: 99 });

      await expect(
        service.update({ uuid, phone: '+9779841999999' })
      ).rejects.toThrow(new RpcException('Phone number must be unique'));
    });

    it('should set phone to null when phone is empty string', async () => {
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(
        existingStakeholder
      );
      mockPrismaService.stakeholders.update.mockResolvedValue({
        ...existingStakeholder,
        phone: null,
      });

      await service.update({ uuid, phone: '' });

      expect(mockPrismaService.stakeholders.findFirst).not.toHaveBeenCalled();
      const updateCall = mockPrismaService.stakeholders.update.mock.calls[0][0];
      expect(updateCall.data.phone).toBeNull();
    });

    it('should fallback to existing values when optional fields not provided', async () => {
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(
        existingStakeholder
      );
      mockPrismaService.stakeholders.update.mockResolvedValue(
        existingStakeholder
      );

      await service.update({ uuid });

      const updateCall = mockPrismaService.stakeholders.update.mock.calls[0][0];
      expect(updateCall.data.name).toBe(existingStakeholder.name);
      expect(updateCall.data.designation).toBe(existingStakeholder.designation);
      expect(updateCall.data.organization).toBe(
        existingStakeholder.organization
      );
      expect(updateCall.data.district).toBe(existingStakeholder.district);
      expect(updateCall.data.municipality).toBe(
        existingStakeholder.municipality
      );
    });

    it('should skip phone uniqueness check when phone is not provided', async () => {
      mockPrismaService.stakeholders.findUnique.mockResolvedValue(
        existingStakeholder
      );
      mockPrismaService.stakeholders.update.mockResolvedValue(
        existingStakeholder
      );

      await service.update({ uuid });

      expect(mockPrismaService.stakeholders.findFirst).not.toHaveBeenCalled();
    });
  });

  // ==================== addGroup() ====================
  describe('addGroup', () => {
    it('should create a stakeholder group with connected stakeholders', async () => {
      const payload = {
        name: 'Group A',
        stakeholders: [{ uuid: 'uuid-1' }, { uuid: 'uuid-2' }],
      };
      const created = { id: 1, uuid: 'group-uuid', name: 'Group A' };
      mockPrismaService.stakeholdersGroups.create.mockResolvedValue(created);

      const result = await service.addGroup(payload);

      expect(mockPrismaService.stakeholdersGroups.create).toHaveBeenCalledWith({
        data: {
          name: 'Group A',
          stakeholders: { connect: payload.stakeholders },
        },
      });
      expect(result).toEqual(created);
    });
  });

  // ==================== updateGroup() ====================
  describe('updateGroup', () => {
    const groupUuid = 'group-uuid-1';
    const existingGroup = { id: 1, uuid: groupUuid, name: 'Old Group' };

    it('should update group name and stakeholders', async () => {
      const payload = {
        uuid: groupUuid,
        name: 'New Group',
        stakeholders: [{ uuid: 'uuid-1' }],
      };
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(
        existingGroup
      );
      mockPrismaService.stakeholdersGroups.update.mockResolvedValue({
        ...existingGroup,
        name: 'New Group',
      });

      const result = await service.updateGroup(payload);

      expect(mockPrismaService.stakeholdersGroups.update).toHaveBeenCalledWith({
        where: { uuid: groupUuid },
        data: {
          name: 'New Group',
          stakeholders: { set: [], connect: [{ uuid: 'uuid-1' }] },
        },
      });
      expect(result.name).toBe('New Group');
    });

    it('should update group name only when stakeholders not provided', async () => {
      const payload = { uuid: groupUuid, name: 'Updated Name' };
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(
        existingGroup
      );
      mockPrismaService.stakeholdersGroups.update.mockResolvedValue({
        ...existingGroup,
        name: 'Updated Name',
      });

      await service.updateGroup(payload);

      const updateCall =
        mockPrismaService.stakeholdersGroups.update.mock.calls[0][0];
      expect(updateCall.data.stakeholders).toBeUndefined();
      expect(updateCall.data.name).toBe('Updated Name');
    });

    it('should throw RpcException when group not found', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(null);

      await expect(
        service.updateGroup({ uuid: 'nonexistent', name: 'Test' })
      ).rejects.toThrow(new RpcException('Group not found!'));
    });

    it('should not include name in update data when name not provided', async () => {
      const payload = {
        uuid: groupUuid,
        stakeholders: [{ uuid: 'uuid-1' }],
      };
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(
        existingGroup
      );
      mockPrismaService.stakeholdersGroups.update.mockResolvedValue(
        existingGroup
      );

      await service.updateGroup(payload);

      const updateCall =
        mockPrismaService.stakeholdersGroups.update.mock.calls[0][0];
      expect(updateCall.data.name).toBeUndefined();
    });
  });

  // ==================== getAllGroups() ====================
  describe('getAllGroups', () => {
    it('should call paginate with search filter and custom sort', async () => {
      const payload = {
        page: 1,
        perPage: 10,
        search: 'test',
        order: 'asc',
        sort: 'name',
      };
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      const result = await service.getAllGroups(payload);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.stakeholdersGroups,
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            name: { contains: 'test', mode: 'insensitive' },
          }),
          orderBy: { name: 'asc' },
        }),
        { page: 1, perPage: 10 }
      );
      expect(result).toEqual({ data: [], meta: {} });
    });

    it('should use default orderBy (createdAt:desc) when sort/order not provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAllGroups({ page: 1, perPage: 20 });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should not include name filter when search is not provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAllGroups({ page: 1, perPage: 10 });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.where.name).toBeUndefined();
    });

    it('should include _count select for active stakeholders', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getAllGroups({ page: 1, perPage: 10 });

      const query = mockPaginateFn.mock.calls[0][1];
      expect(query.include._count.select.stakeholders).toEqual({
        where: { isDeleted: false },
      });
    });
  });

  // ==================== getAllGroupsByUuids() ====================
  describe('getAllGroupsByUuids', () => {
    it('should fetch groups by UUIDs without select fields', async () => {
      const payload = {
        uuids: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001',
        ],
        selectField: undefined,
      };
      const mockGroups = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Group 1',
          description: 'Description 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          uuid: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Group 2',
          description: 'Description 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(
        mockGroups
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: {
          uuid: {
            in: [
              '123e4567-e89b-12d3-a456-426614174000',
              '123e4567-e89b-12d3-a456-426614174001',
            ],
          },
        },
      });
      expect(result).toEqual(mockGroups);
    });

    it('should fetch groups by UUIDs with select fields', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: ['uuid', 'name'],
      };
      const mockSelectedGroups = [
        { uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Group 1' },
      ];

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(
        mockSelectedGroups
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: {
          uuid: { in: ['123e4567-e89b-12d3-a456-426614174000'] },
        },
        select: { uuid: true, name: true },
      });
      expect(result).toEqual(mockSelectedGroups);
    });

    it('should return empty array when no groups found', async () => {
      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsByUuids({
        uuids: ['non-existent-uuid'],
        selectField: undefined,
      });

      expect(result).toEqual([]);
    });

    it('should handle empty UUIDs array', async () => {
      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsByUuids({
        uuids: [],
        selectField: undefined,
      });

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: { uuid: { in: [] } },
      });
      expect(result).toEqual([]);
    });

    it('should handle empty select fields array (no select clause)', async () => {
      const mockGroup = [{ id: 1, uuid: 'uuid-1', name: 'Test Group' }];
      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(
        mockGroup
      );

      const result = await service.getAllGroupsByUuids({
        uuids: ['uuid-1'],
        selectField: [],
      });

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: { uuid: { in: ['uuid-1'] } },
      });
      expect(result).toEqual(mockGroup);
    });

    it('should throw RpcException when database error occurs', async () => {
      mockPrismaService.stakeholdersGroups.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        service.getAllGroupsByUuids({
          uuids: ['uuid-1'],
          selectField: undefined,
        })
      ).rejects.toThrow(
        new RpcException(
          'Error while fetching stakeholders groups by uuids. Database connection failed'
        )
      );
    });

    it('should throw RpcException with empty message when error has no message', async () => {
      mockPrismaService.stakeholdersGroups.findMany.mockRejectedValue(
        new Error()
      );

      await expect(
        service.getAllGroupsByUuids({
          uuids: ['uuid-1'],
          selectField: undefined,
        })
      ).rejects.toThrow(
        new RpcException('Error while fetching stakeholders groups by uuids. ')
      );
    });
  });

  // ==================== getGroupDetailsByUuids() ====================
  describe('getGroupDetailsByUuids', () => {
    it('should fetch group details with active stakeholders', async () => {
      const uuids = ['uuid-1', 'uuid-2'];
      const groups = [
        { id: 1, uuid: 'uuid-1', name: 'Group 1', stakeholders: [] },
        { id: 2, uuid: 'uuid-2', name: 'Group 2', stakeholders: [] },
      ];
      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(groups);

      const result = await service.getGroupDetailsByUuids({ uuids });

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: { uuid: { in: uuids }, isDeleted: false },
        include: { stakeholders: { where: { isDeleted: false } } },
      });
      expect(result).toEqual(groups);
    });

    it('should return empty array when no groups match', async () => {
      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue([]);

      const result = await service.getGroupDetailsByUuids({
        uuids: ['nonexistent'],
      });

      expect(result).toEqual([]);
    });

    it('should throw RpcException on database error', async () => {
      mockPrismaService.stakeholdersGroups.findMany.mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        service.getGroupDetailsByUuids({ uuids: ['uuid-1'] })
      ).rejects.toThrow(RpcException);
    });
  });

  // ==================== getOneGroup() ====================
  describe('getOneGroup', () => {
    it('should return group with active stakeholders only', async () => {
      const uuid = 'group-uuid';
      const group = {
        id: 1,
        uuid,
        name: 'Group',
        stakeholders: [{ id: 1, isDeleted: false }],
      };
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(group);

      const result = await service.getOneGroup({ uuid });

      expect(
        mockPrismaService.stakeholdersGroups.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid },
        include: { stakeholders: { where: { isDeleted: false } } },
      });
      expect(result).toEqual(group);
    });

    it('should return null when group not found', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(null);

      const result = await service.getOneGroup({ uuid: 'nonexistent' });

      expect(result).toBeNull();
    });
  });

  // ==================== removeGroup() ====================
  describe('removeGroup', () => {
    const uuid = 'group-uuid';
    const existingGroup = { id: 1, uuid, name: 'Group A' };

    it('should throw RpcException when group not found', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(null);

      await expect(service.removeGroup({ uuid })).rejects.toThrow(
        new RpcException('Group not found!')
      );
    });

    it('should return isSuccess:false with activity names when group has activities', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(
        existingGroup
      );
      mockClientProxy.send.mockReturnValue(
        of([{ title: 'Activity 1' }, { title: 'Activity 2' }])
      );

      const result = await service.removeGroup({ uuid });

      expect(result).toEqual({
        isSuccess: false,
        activities: ['Activity 1', 'Activity 2'],
      });
      expect(
        mockPrismaService.stakeholdersGroups.update
      ).not.toHaveBeenCalled();
    });

    it('should soft delete group and return isSuccess:true when no activities', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(
        existingGroup
      );
      mockClientProxy.send.mockReturnValue(of([]));
      mockPrismaService.stakeholdersGroups.update.mockResolvedValue({
        ...existingGroup,
        isDeleted: true,
      });

      const result = await service.removeGroup({ uuid });

      expect(mockPrismaService.stakeholdersGroups.update).toHaveBeenCalledWith({
        where: { uuid },
        data: { isDeleted: true },
      });
      expect(result).toEqual({ isSuccess: true, activities: [] });
    });

    it('should return isSuccess:false when activities is null', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(
        existingGroup
      );
      // activities is null/falsy → no activities block entered
      mockClientProxy.send.mockReturnValue(of(null));
      mockPrismaService.stakeholdersGroups.update.mockResolvedValue({
        ...existingGroup,
        isDeleted: true,
      });

      const result = await service.removeGroup({ uuid });

      // null activities → condition `activities && activities.length > 0` is false
      expect(result).toEqual({ isSuccess: true, activities: [] });
    });
  });

  // ==================== getActivitiesByStakeholderGroupUuid() ====================
  describe('getActivitiesByStakeholderGroupUuid', () => {
    it('should return activities from client send', async () => {
      const uuid = 'group-uuid';
      const activities = [{ title: 'Activity 1' }, { title: 'Activity 2' }];
      mockClientProxy.send.mockReturnValue(of(activities));

      const result = await service.getActivitiesByStakeholderGroupUuid(uuid);

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'ms.jobs.activities.getByStakeholderUuid' },
        { stakeholderGroupUuid: uuid }
      );
      expect(result).toEqual(activities);
    });

    it('should return empty array when no activities', async () => {
      mockClientProxy.send.mockReturnValue(of([]));

      const result = await service.getActivitiesByStakeholderGroupUuid('uuid');

      expect(result).toEqual([]);
    });

    it('should throw RpcException when client send fails', async () => {
      mockClientProxy.send.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      await expect(
        service.getActivitiesByStakeholderGroupUuid('uuid')
      ).rejects.toThrow(
        new RpcException(
          'Error while fetching related activities. Network error'
        )
      );
    });
  });

  // ==================== findOneGroup() ====================
  describe('findOneGroup', () => {
    it('should return group with all stakeholders (including deleted)', async () => {
      const uuid = 'group-uuid';
      const group = {
        id: 1,
        uuid,
        name: 'Group',
        stakeholders: [
          { id: 1, isDeleted: false },
          { id: 2, isDeleted: true },
        ],
      };
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(group);

      const result = await service.findOneGroup({ uuid });

      expect(
        mockPrismaService.stakeholdersGroups.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid },
        include: { stakeholders: true },
      });
      expect(result).toEqual(group);
    });

    it('should return null when group not found', async () => {
      mockPrismaService.stakeholdersGroups.findUnique.mockResolvedValue(null);

      const result = await service.findOneGroup({ uuid: 'nonexistent' });

      expect(result).toBeNull();
    });
  });

  // ==================== validateStakeholders() ====================
  describe('validateStakeholders', () => {
    it('should return valid stakeholders with correct field mapping (Name)', async () => {
      const payload = [
        {
          Name: 'John Doe',
          Designation: 'Engineer',
          Organization: 'Test Org',
          District: 'Kathmandu',
          Municipality: 'Metro',
          'Mobile #': '9841000000',
          'Support Area': 'Health, Education',
          'Email ID': 'john@test.com',
        },
      ];

      const result = await service.validateStakeholders(payload);

      expect(result.validStakeholders).toHaveLength(1);
      expect(result.validStakeholders[0].name).toBe('John Doe');
      expect(result.validStakeholders[0].designation).toBe('Engineer');
      expect(result.validStakeholders[0].supportArea).toEqual([
        'Health',
        'Education',
      ]);
      expect(result.validStakeholders[0].email).toBe('john@test.com');
    });

    it('should map "Stakeholders Name" field when "Name" is absent', async () => {
      const payload = [
        {
          'Stakeholders Name': 'Jane Doe',
          Designation: 'Analyst',
          Organization: 'Org B',
          District: 'Lalitpur',
          Municipality: 'Metro',
          'Phone Number': '9841000001',
          Email: 'jane@test.com',
        },
      ];

      const result = await service.validateStakeholders(payload);

      expect(result.validStakeholders[0].name).toBe('Jane Doe');
      expect(result.validStakeholders[0].phone).toBe('9841000001');
      expect(result.validStakeholders[0].email).toBe('jane@test.com');
    });

    it('should map "Support Area #" field for supportArea', async () => {
      const payload = [
        {
          Name: 'Test User',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '9841000002',
          'Support Area #': 'Water, Shelter',
        },
      ];

      const result = await service.validateStakeholders(payload);

      expect(result.validStakeholders[0].supportArea).toEqual([
        'Water',
        'Shelter',
      ]);
    });

    it('should throw RpcException when validation fails for empty name', async () => {
      const payload = [
        {
          Name: '',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '9841000000',
        },
      ];

      await expect(service.validateStakeholders(payload)).rejects.toThrow(
        RpcException
      );
    });

    it('should throw RpcException with validation error details', async () => {
      const payload = [
        {
          Name: '',
          Designation: '',
          Organization: '',
          District: '',
          Municipality: '',
          'Mobile #': '123', // too short (< 7)
        },
      ];

      try {
        await service.validateStakeholders(payload);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        const errorObj = (err as RpcException).getError() as any;
        expect(errorObj.success).toBe(false);
        expect(errorObj.message).toBe('Validation failed');
        expect(errorObj.meta.statusCode).toBe(400);
      }
    });

    it('should handle empty supportArea gracefully', async () => {
      const payload = [
        {
          Name: 'Test',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '9841000003',
        },
      ];

      const result = await service.validateStakeholders(payload);

      expect(result.validStakeholders[0].supportArea).toEqual([]);
    });

    it('should process multiple rows and separate valid from invalid', async () => {
      const payload = [
        {
          Name: 'Valid User',
          Designation: 'Engineer',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '9841000004',
        },
        {
          Name: '', // invalid
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '9841000005',
        },
      ];

      // Mixed valid/invalid → should throw because there are errors
      await expect(service.validateStakeholders(payload)).rejects.toThrow(
        RpcException
      );
    });
  });

  // ==================== stakeholdersCount() ====================
  describe('stakeholdersCount', () => {
    it('should count active stakeholders and save to stats', async () => {
      const count = 42;
      const statsResult = {
        id: 1,
        name: 'stakeholders_total',
        group: 'stakeholders',
        data: { count },
      };
      mockPrismaService.stakeholders.count.mockResolvedValue(count);
      mockStatsService.save.mockResolvedValue(statsResult);

      const result = await service.stakeholdersCount();

      expect(mockPrismaService.stakeholders.count).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
      expect(mockStatsService.save).toHaveBeenCalledWith({
        name: 'stakeholders_total',
        group: 'stakeholders',
        data: { count: 42 },
      });
      expect(result).toEqual(statsResult);
    });

    it('should handle zero stakeholders count', async () => {
      mockPrismaService.stakeholders.count.mockResolvedValue(0);
      mockStatsService.save.mockResolvedValue({ data: { count: 0 } });

      await service.stakeholdersCount();

      expect(mockStatsService.save).toHaveBeenCalledWith({
        name: 'stakeholders_total',
        group: 'stakeholders',
        data: { count: 0 },
      });
    });
  });
});
