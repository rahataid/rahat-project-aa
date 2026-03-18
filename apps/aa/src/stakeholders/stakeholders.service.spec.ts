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

  const mockPrismaService: any = {
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
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
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

  // ==================== validateBulkStakeholders() ====================
  describe('validateBulkStakeholders', () => {
    const validRow = {
      Name: 'John Doe',
      Designation: 'Engineer',
      Organization: 'Test Org',
      District: 'Kathmandu',
      Municipality: 'Metro',
      'Mobile #': '+9779841000000',
      'Support Area': 'Health, Education',
      'Email ID': 'john@test.com',
    };

    beforeEach(() => {
      // Default: no existing records in DB for both phone + email lookups
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);
    });

    it('should throw RpcException when payload is empty', async () => {
      await expect(service.validateBulkStakeholders([])).rejects.toThrow(
        RpcException
      );
      await expect(service.validateBulkStakeholders(null)).rejects.toThrow(
        RpcException
      );
    });

    it('should return isValid true and classify new stakeholder when phone not in DB', async () => {
      const result = await service.validateBulkStakeholders([validRow]);

      expect(result.isValid).toBe(true);
      expect(result.newStakeholders).toContain('+9779841000000');
      expect(result.updateStakeholders).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should return cleanedPayloads with normalized phone', async () => {
      const result = await service.validateBulkStakeholders([validRow]);

      expect(result.cleanedPayloads).toHaveLength(1);
      expect(result.cleanedPayloads[0].phone).toBe('+9779841000000');
      expect(result.cleanedPayloads[0].email).toBe('john@test.com');
    });

    it('should classify as updateStakeholder when phone already exists in DB', async () => {
      // fetchExistingByPhone returns existing record → classified as update
      // checkEmailConflicts: email belongs to the same uuid → no conflict
      mockPrismaService.stakeholders.findMany
        .mockResolvedValueOnce([
          { phone: '+9779841000000', email: 'john@test.com', uuid: 'uuid-1' },
        ]) // phone lookup
        .mockResolvedValueOnce([
          { email: 'john@test.com', uuid: 'uuid-1', phone: '+9779841000000' },
        ]); // email lookup

      const result = await service.validateBulkStakeholders([validRow]);

      expect(result.isValid).toBe(true);
      expect(result.updateStakeholders).toContain('+9779841000000');
      expect(result.newStakeholders).toHaveLength(0);
    });

    it('should normalize 10-digit phone to +977 format before DB lookup', async () => {
      const rowWith10Digit = { ...validRow, 'Mobile #': '9841000000' };

      const result = await service.validateBulkStakeholders([rowWith10Digit]);

      // cleanedPayloads phone should be normalized
      expect(result.cleanedPayloads[0].phone).toBe('+9779841000000');
      // DB lookup and classification used normalized phone
      expect(result.newStakeholders).toContain('+9779841000000');
    });

    it('should normalize email to lowercase', async () => {
      const rowUpperEmail = { ...validRow, 'Email ID': 'JOHN@TEST.COM' };

      const result = await service.validateBulkStakeholders([rowUpperEmail]);

      expect(result.cleanedPayloads[0].email).toBe('john@test.com');
    });

    it('should return isValid false with error when duplicate phone exists in payload', async () => {
      const result = await service.validateBulkStakeholders([
        validRow,
        { ...validRow },
      ]);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.field === 'phone' && e.message.includes('Duplicate')
        )
      ).toBe(true);
    });

    it('should return isValid false with error when duplicate email exists in payload', async () => {
      const row2 = { ...validRow, 'Mobile #': '+9779841000001' };

      const result = await service.validateBulkStakeholders([validRow, row2]);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.field === 'email' && e.message.includes('Duplicate')
        )
      ).toBe(true);
    });

    it('should return isValid false when email belongs to a different stakeholder in DB', async () => {
      // phone lookup: new stakeholder (not in DB)
      // email lookup: email exists but belongs to a different uuid
      mockPrismaService.stakeholders.findMany
        .mockResolvedValueOnce([]) // fetchExistingByPhone
        .mockResolvedValueOnce([
          {
            email: 'john@test.com',
            uuid: 'other-uuid',
            phone: '+9779999999999',
          },
        ]); // checkEmailConflicts

      const result = await service.validateBulkStakeholders([validRow]);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field === 'email' && e.message.includes('another stakeholder')
        )
      ).toBe(true);
    });

    it('should return isValid false when DTO validation fails (invalid phone)', async () => {
      const rowBadPhone = { ...validRow, 'Mobile #': '123' };

      // Invalid row: DTO errors fire first; row still passes through normalize/classify
      // but findMany is still called (invalid rows are not excluded before DB lookup)
      const result = await service.validateBulkStakeholders([rowBadPhone]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'phone')).toBe(true);
    });

    it('should return isValid false when required field name is missing', async () => {
      const rowNoName = { ...validRow, Name: '', 'Stakeholders Name': '' };

      const result = await service.validateBulkStakeholders([rowNoName]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should deduplicate errors — same conflict reported exactly once', async () => {
      // Row 2 and row 3 have the same phone → only 1 duplicate error via errorsMap key
      const row2 = { ...validRow, 'Email ID': '' };
      const row3 = { ...validRow, 'Email ID': '' };

      const result = await service.validateBulkStakeholders([row2, row3, row3]);

      const phoneErrors = result.errors.filter(
        (e) => e.field === 'phone' && e.message.includes('Duplicate')
      );
      expect(phoneErrors).toHaveLength(1);
    });

    it('should always return newStakeholders and updateStakeholders arrays even when errors exist', async () => {
      const row2 = { ...validRow, 'Mobile #': '+9779841000001' }; // dup email with validRow
      const result = await service.validateBulkStakeholders([validRow, row2]);

      expect(Array.isArray(result.newStakeholders)).toBe(true);
      expect(Array.isArray(result.updateStakeholders)).toBe(true);
    });

    it('should make exactly 2 DB calls (phone lookup + email lookup)', async () => {
      await service.validateBulkStakeholders([validRow]);

      // fetchExistingByPhone + checkEmailConflicts = 2 findMany calls
      expect(mockPrismaService.stakeholders.findMany).toHaveBeenCalledTimes(2);
    });

    it('should make only 1 DB call when no emails in payload', async () => {
      const rowNoEmail = { ...validRow, 'Email ID': '' };

      await service.validateBulkStakeholders([rowNoEmail]);

      // checkEmailConflicts skips DB call when emailsToCheck is empty
      expect(mockPrismaService.stakeholders.findMany).toHaveBeenCalledTimes(1);
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
      'Mobile #': '+9779841000000',
      'Support Area': 'Health, Education',
      'Email ID': 'john@test.com',
    };

    const basePayload = {
      data: [validRow],
      isGroupCreate: false,
    };

    beforeEach(() => {
      mockPrismaService.$transaction.mockImplementation((cb) =>
        cb(mockPrismaService)
      );
      // Default: no existing records — all new
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);
      mockPrismaService.stakeholders.createMany.mockResolvedValue({ count: 1 });
      // Default: group name is unique (no existing group)
      mockPrismaService.stakeholdersGroups.findFirst.mockResolvedValue(null);
    });

    it('should throw RpcException when data is empty', async () => {
      await expect(
        service.bulkAdd({ data: [], isGroupCreate: false })
      ).rejects.toThrow(RpcException);
    });

    it('should throw RpcException when isGroupCreate is true but groupName is missing', async () => {
      // groupName guard fires before findFirst — no DB calls at all
      await expect(
        service.bulkAdd({ data: [validRow], isGroupCreate: true })
      ).rejects.toThrow(RpcException);

      expect(
        mockPrismaService.stakeholdersGroups.findFirst
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.stakeholders.findMany).not.toHaveBeenCalled();
    });

    it('should throw RpcException when isGroupCreate is true but groupName is whitespace', async () => {
      await expect(
        service.bulkAdd({
          data: [validRow],
          isGroupCreate: true,
          groupName: '   ',
        })
      ).rejects.toThrow(RpcException);

      expect(
        mockPrismaService.stakeholdersGroups.findFirst
      ).not.toHaveBeenCalled();
    });

    it('should throw RpcException when groupName already exists in DB', async () => {
      // findFirst returns existing group → duplicate name
      mockPrismaService.stakeholdersGroups.findFirst.mockResolvedValue({
        uuid: 'existing-group-uuid',
        name: 'Test Group',
      });

      await expect(
        service.bulkAdd({
          data: [validRow],
          isGroupCreate: true,
          groupName: 'Test Group',
        })
      ).rejects.toThrow(RpcException);

      // findFirst was called with the group name
      expect(
        mockPrismaService.stakeholdersGroups.findFirst
      ).toHaveBeenCalledWith({
        where: { name: 'Test Group' },
      });
      // validateBulkStakeholders must NOT run after the guard throws
      expect(mockPrismaService.stakeholders.findMany).not.toHaveBeenCalled();
    });

    it('should return success false with errors when validation fails', async () => {
      const invalidRow = { ...validRow, 'Mobile #': '123' }; // invalid phone

      const result = await service.bulkAdd({
        data: [invalidRow],
        isGroupCreate: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      // Transaction should NOT be entered when validation fails
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should create new stakeholders and return createdCount', async () => {
      const result = await service.bulkAdd(basePayload);

      expect(result.success).toBe(true);
      expect(result.result.createdCount).toBe(1);
      expect(result.result.updatedCount).toBe(0);
      expect(result.message).toBe('All stakeholders successfully added.');
      expect(mockPrismaService.stakeholders.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true })
      );
    });

    it('should update existing stakeholders when phone already in DB', async () => {
      // validateBulkStakeholders: phone lookup → existing, email lookup → same uuid → no conflict
      mockPrismaService.stakeholders.findMany
        .mockResolvedValueOnce([
          { phone: '+9779841000000', email: 'john@test.com', uuid: 'uuid-1' },
        ]) // fetchExistingByPhone
        .mockResolvedValueOnce([
          { email: 'john@test.com', uuid: 'uuid-1', phone: '+9779841000000' },
        ]); // checkEmailConflicts
      mockPrismaService.stakeholders.update.mockResolvedValue({});

      const result = await service.bulkAdd(basePayload);

      expect(result.success).toBe(true);
      expect(result.result.updatedCount).toBe(1);
      expect(result.result.createdCount).toBe(0);
      expect(mockPrismaService.stakeholders.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { phone: '+9779841000000' } })
      );
      expect(mockPrismaService.stakeholders.createMany).not.toHaveBeenCalled();
    });

    it('should create group and connect new stakeholders when isGroupCreate is true', async () => {
      // findFirst returns null → group name is unique → proceed
      mockPrismaService.stakeholdersGroups.findFirst.mockResolvedValue(null);
      const group = { uuid: 'group-uuid-1', name: 'Test Group' };
      mockPrismaService.stakeholdersGroups.create.mockResolvedValue(group);
      mockPrismaService.stakeholders.findMany
        .mockResolvedValueOnce([]) // fetchExistingByPhone — all new
        .mockResolvedValueOnce([]) // checkEmailConflicts — no conflicts
        .mockResolvedValueOnce([{ uuid: 'new-stake-uuid' }]); // fetch newly created uuids for connect
      mockPrismaService.stakeholdersGroups.update.mockResolvedValue({});

      const result = await service.bulkAdd({
        data: [validRow],
        isGroupCreate: true,
        groupName: 'Test Group',
      });

      expect(result.success).toBe(true);
      // Uniqueness check was done before transaction
      expect(
        mockPrismaService.stakeholdersGroups.findFirst
      ).toHaveBeenCalledWith({
        where: { name: 'Test Group' },
      });
      expect(mockPrismaService.stakeholdersGroups.create).toHaveBeenCalledWith({
        data: { name: 'Test Group' },
      });
      expect(mockPrismaService.stakeholdersGroups.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uuid: 'group-uuid-1' } })
      );
    });

    it('should connect updated stakeholder to group when isGroupCreate is true', async () => {
      // findFirst returns null → group name is unique → proceed
      mockPrismaService.stakeholdersGroups.findFirst.mockResolvedValue(null);
      // Existing stakeholder (update path) + group create
      mockPrismaService.stakeholders.findMany
        .mockResolvedValueOnce([
          { phone: '+9779841000000', email: 'john@test.com', uuid: 'uuid-1' },
        ]) // fetchExistingByPhone
        .mockResolvedValueOnce([
          { email: 'john@test.com', uuid: 'uuid-1', phone: '+9779841000000' },
        ]); // checkEmailConflicts
      const group = { uuid: 'group-uuid-1', name: 'My Group' };
      mockPrismaService.stakeholdersGroups.create.mockResolvedValue(group);
      mockPrismaService.stakeholders.update.mockResolvedValue({});

      const result = await service.bulkAdd({
        data: [validRow],
        isGroupCreate: true,
        groupName: 'My Group',
      });

      expect(result.success).toBe(true);
      // update must include group connect
      expect(mockPrismaService.stakeholders.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stakeholdersGroups: { connect: { uuid: 'group-uuid-1' } },
          }),
        })
      );
      // only 2 findMany calls: fetchExistingByPhone + checkEmailConflicts
      // (no 3rd call because update path doesn't need newly-created uuids)
      expect(mockPrismaService.stakeholders.findMany).toHaveBeenCalledTimes(2);
    });

    it('should NOT connect group when isGroupCreate is false', async () => {
      mockPrismaService.stakeholders.update.mockResolvedValue({});
      // existing phone → update path
      mockPrismaService.stakeholders.findMany
        .mockResolvedValueOnce([
          { phone: '+9779841000000', email: 'john@test.com', uuid: 'uuid-1' },
        ])
        .mockResolvedValueOnce([
          { email: 'john@test.com', uuid: 'uuid-1', phone: '+9779841000000' },
        ]);

      await service.bulkAdd(basePayload);

      expect(
        mockPrismaService.stakeholdersGroups.findFirst
      ).not.toHaveBeenCalled();
      expect(
        mockPrismaService.stakeholdersGroups.create
      ).not.toHaveBeenCalled();
    });

    it('should emit STAKEHOLDER_CREATED event on success', async () => {
      await service.bulkAdd(basePayload);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'events.stakeholders_created'
      );
    });

    it('should NOT emit event when validation fails', async () => {
      const invalidRow = { ...validRow, 'Mobile #': '123' };
      await service.bulkAdd({ data: [invalidRow], isGroupCreate: false });

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
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

  // ==================== validateStakeholders() — tested via validateBulkStakeholders ====================
  describe('validateStakeholders (field mapping via validateBulkStakeholders)', () => {
    beforeEach(() => {
      mockPrismaService.stakeholders.findMany.mockResolvedValue([]);
    });

    it('should correctly map Name, Designation, supportArea and email fields', async () => {
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

      const result = await service.validateBulkStakeholders(payload);

      expect(result.isValid).toBe(true);
      expect(result.newStakeholders).toContain('+9779841000000');
    });

    it('should map "Stakeholders Name" field when "Name" is absent', async () => {
      const payload = [
        {
          'Stakeholders Name': 'Jane Doe',
          Designation: 'Analyst',
          Organization: 'Org B',
          District: 'Lalitpur',
          Municipality: 'Metro',
          'Phone Number': '+9779841000001',
          Email: 'jane@test.com',
        },
      ];

      const result = await service.validateBulkStakeholders(payload);

      expect(result.isValid).toBe(true);
      expect(result.newStakeholders).toContain('+9779841000001');
    });

    it('should map "Support Area #" field for supportArea', async () => {
      const payload = [
        {
          Name: 'Test User',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '+9779841000002',
          'Support Area #': 'Water, Shelter',
        },
      ];

      const result = await service.validateBulkStakeholders(payload);

      // Valid row means field parsing was correct
      expect(result.isValid).toBe(true);
    });

    it('should return isValid false when name is empty', async () => {
      const payload = [
        {
          Name: '',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '+9779841000000',
        },
      ];

      const result = await service.validateBulkStakeholders(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should return isValid false with errors when phone is too short', async () => {
      const payload = [
        {
          Name: 'Test',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '123',
        },
      ];

      const result = await service.validateBulkStakeholders(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'phone')).toBe(true);
    });

    it('should handle empty supportArea gracefully', async () => {
      const payload = [
        {
          Name: 'Test',
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '+9779841000003',
        },
      ];

      const result = await service.validateBulkStakeholders(payload);

      expect(result.isValid).toBe(true);
    });

    it('should return isValid false when any row has a validation error', async () => {
      const payload = [
        {
          Name: 'Valid User',
          Designation: 'Engineer',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '+9779841000004',
        },
        {
          Name: '', // invalid
          Designation: 'Dev',
          Organization: 'Org',
          District: 'Dist',
          Municipality: 'Muni',
          'Mobile #': '+9779841000005',
        },
      ];

      const result = await service.validateBulkStakeholders(payload);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
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
