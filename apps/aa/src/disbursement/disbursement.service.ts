import { Injectable } from '@nestjs/common';
import { DisbursementServices } from '@rahat-project/stellar-sdk';
import { CreateDisbursementDto } from './dto';

@Injectable()
export class DisbursementService {
  async createDisbursement(file: File, dto: CreateDisbursementDto) {
    console.log(file, 'File');
    console.log(dto.email, 'Email');
    console.log(dto.password, 'Password');
    console.log(dto.tenant_name, 'Tenant name');
    const disbursementService = new DisbursementServices(
      dto.email,
      dto.password,
      dto.tenant_name,
      dto.disbursement_name,
      file
    );
    return disbursementService.createDisbursementProcess();
  }
}
