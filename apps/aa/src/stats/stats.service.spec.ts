import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@rumsan/prisma';

describe('StatsService', () => {
  let service: StatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, ConfigService, PrismaService],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
