import { Injectable, Logger } from '@nestjs/common';
import { IvrStatus } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { CreateIvrTemplateDto } from './dto/create-ivr-template.dto';
import { UpdateIvrTemplateDto } from './dto/update-ivr-template.dto';

@Injectable()
export class IvrTemplatesService {
  private readonly logger = new Logger(IvrTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIvrTemplateDto) {
    try {
      const data = {
        name: dto.name,
        description: dto.description,
        flowUrl: dto.flowUrl,
        ...(dto.flowUrl && { status: IvrStatus.ACTIVE }),
      };
      return this.prisma.ivrTemplate.create({ data });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll() {
    try {
      return this.prisma.ivrTemplate.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      return this.prisma.ivrTemplate.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(dto: UpdateIvrTemplateDto) {
    try {
      const { id, ...data } = dto;
      const updateData: any = { ...data };
      if (data.flowUrl) {
        updateData.status = IvrStatus.ACTIVE;
      }
      return this.prisma.ivrTemplate.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async remove(id: number) {
    try {
      return this.prisma.ivrTemplate.update({
        where: { id },
        data: { status: IvrStatus.ARCHIVED },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
