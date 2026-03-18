import { Test, TestingModule } from '@nestjs/testing';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';
import {
  CreateInkindDto,
  DeleteInkindDto,
  GetInkindDto,
  InkindType,
  ListInkindDto,
  UpdateInkindDto,
} from './dto/inkind.dto';

describe('InkindsController', () => {
  let controller: InkindsController;
  let inkindsService: InkindsService;

  const mockInkindsService = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
    getOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InkindsController],
      providers: [
        {
          provide: InkindsService,
          useValue: mockInkindsService,
        },
      ],
    }).compile();

    controller = module.get<InkindsController>(InkindsController);
    inkindsService = module.get<InkindsService>(InkindsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(inkindsService).toBeDefined();
  });

  describe('create', () => {
    it('should create an inkind successfully', async () => {
      const createInkindDto: CreateInkindDto = {
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
        description: '25kg rice bag',
        quantity: 10,
      };

      const expectedResult = {
        uuid: 'inkind-uuid-123',
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
        description: '25kg rice bag',
        availableStock: 10,
      };

      mockInkindsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.create).toHaveBeenCalledWith(createInkindDto);
    });

    it('should handle service errors in create', async () => {
      const createInkindDto: CreateInkindDto = {
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
      };

      const error = new Error('Inkind already exists');
      mockInkindsService.create.mockRejectedValue(error);

      await expect(controller.create(createInkindDto)).rejects.toThrow(
        'Inkind already exists'
      );
    });
  });

  describe('update', () => {
    it('should update an inkind successfully', async () => {
      const updateInkindDto: UpdateInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Updated Rice Bag',
        type: InkindType.PRE_DEFINED,
      };

      const expectedResult = {
        uuid: updateInkindDto.uuid,
        name: 'Updated Rice Bag',
        type: InkindType.PRE_DEFINED,
      };

      mockInkindsService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(updateInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.update).toHaveBeenCalledWith(updateInkindDto);
    });

    it('should handle update errors', async () => {
      const updateInkindDto: UpdateInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Updated Rice Bag',
      };

      const error = new Error('Inkind not found');
      mockInkindsService.update.mockRejectedValue(error);

      await expect(controller.update(updateInkindDto)).rejects.toThrow(
        'Inkind not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete an inkind successfully', async () => {
      const deleteInkindDto: DeleteInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const expectedResult = {
        success: true,
        message: 'Inkind deleted successfully',
      };

      mockInkindsService.delete.mockResolvedValue(expectedResult);

      const result = await controller.delete(deleteInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.delete).toHaveBeenCalledWith(
        deleteInkindDto.uuid
      );
    });

    it('should handle delete errors', async () => {
      const deleteInkindDto: DeleteInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const error = new Error('Inkind not found');
      mockInkindsService.delete.mockRejectedValue(error);

      await expect(controller.delete(deleteInkindDto)).rejects.toThrow(
        'Inkind not found'
      );
    });
  });

  describe('get', () => {
    it('should return paginated inkinds', async () => {
      const listInkindDto: ListInkindDto = {
        page: 1,
        perPage: 10,
        type: InkindType.WALK_IN,
        name: 'rice',
        sort: 'name',
        order: 'asc',
      };

      const expectedResult = {
        data: [
          {
            uuid: 'inkind-uuid-123',
            name: 'Rice Bag',
            type: InkindType.WALK_IN,
            availableStock: 10,
          },
        ],
        meta: {
          total: 1,
          page: 1,
          perPage: 10,
        },
      };

      mockInkindsService.get.mockResolvedValue(expectedResult);

      const result = await controller.get(listInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.get).toHaveBeenCalledWith(listInkindDto);
    });

    it('should handle empty payload in get', async () => {
      const listInkindDto: ListInkindDto = {};

      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, perPage: 10 },
      };

      mockInkindsService.get.mockResolvedValue(expectedResult);

      const result = await controller.get(listInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.get).toHaveBeenCalledWith(listInkindDto);
    });
  });

  describe('getOne', () => {
    it('should return a single inkind by uuid', async () => {
      const getInkindDto: GetInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const expectedResult = {
        uuid: getInkindDto.uuid,
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
        availableStock: 10,
      };

      mockInkindsService.getOne.mockResolvedValue(expectedResult);

      const result = await controller.getOne(getInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.getOne).toHaveBeenCalledWith(getInkindDto.uuid);
    });

    it('should handle non-existent inkind in getOne', async () => {
      const getInkindDto: GetInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const error = new Error('Inkind not found');
      mockInkindsService.getOne.mockRejectedValue(error);

      await expect(controller.getOne(getInkindDto)).rejects.toThrow(
        'Inkind not found'
      );
    });
  });
});
