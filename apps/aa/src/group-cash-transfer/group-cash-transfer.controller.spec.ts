import { Test, TestingModule } from '@nestjs/testing';
import { GroupCashTransferController } from './group-cash-transfer.controller';
import { GroupCashTransferService } from './group-cash-transfer.service';

const MOCK_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MOCK_RECORD_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockService = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  get: jest.fn(),
  getOne: jest.fn(),
  assignFund: jest.fn(),
  disburse: jest.fn(),
};

describe('GroupCashTransferController', () => {
  let controller: GroupCashTransferController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupCashTransferController],
      providers: [{ provide: GroupCashTransferService, useValue: mockService }],
    }).compile();

    controller = module.get<GroupCashTransferController>(GroupCashTransferController);
  });

  it('create delegates to service', async () => {
    mockService.create.mockResolvedValue({ uuid: MOCK_UUID });
    const result = await controller.create({ name: 'Test Group' });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'Test Group' });
    expect(result).toEqual({ uuid: MOCK_UUID });
  });

  it('update delegates to service', async () => {
    mockService.update.mockResolvedValue({ uuid: MOCK_UUID, name: 'Updated' });
    const result = await controller.update({ uuid: MOCK_UUID, name: 'Updated' });
    expect(mockService.update).toHaveBeenCalledWith({ uuid: MOCK_UUID, name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('delete delegates to service', async () => {
    mockService.delete.mockResolvedValue({ success: true });
    const result = await controller.delete(MOCK_UUID);
    expect(mockService.delete).toHaveBeenCalledWith(MOCK_UUID);
    expect(result.success).toBe(true);
  });

  it('get delegates to service', async () => {
    mockService.get.mockResolvedValue({ data: [], meta: {} });
    const result = await controller.get({});
    expect(mockService.get).toHaveBeenCalledWith({});
    expect(result.data).toEqual([]);
  });

  it('getOne delegates to service', async () => {
    mockService.getOne.mockResolvedValue({ uuid: MOCK_UUID, totalAmount: 500 });
    const result = await controller.getOne(MOCK_UUID);
    expect(mockService.getOne).toHaveBeenCalledWith(MOCK_UUID);
    expect(result.totalAmount).toBe(500);
  });

  it('assignFund delegates to service', async () => {
    mockService.assignFund.mockResolvedValue({ uuid: MOCK_RECORD_UUID });
    const result = await controller.assignFund({ groupCashTransferId: MOCK_UUID, amount: 500 });
    expect(mockService.assignFund).toHaveBeenCalledWith({ groupCashTransferId: MOCK_UUID, amount: 500 });
    expect(result.uuid).toBe(MOCK_RECORD_UUID);
  });

  it('disburse delegates to service', async () => {
    mockService.disburse.mockResolvedValue({ success: true, recordUuid: MOCK_RECORD_UUID });
    const result = await controller.disburse(MOCK_RECORD_UUID);
    expect(mockService.disburse).toHaveBeenCalledWith(MOCK_RECORD_UUID);
    expect(result.success).toBe(true);
  });
});
