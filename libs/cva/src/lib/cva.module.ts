import { DynamicModule, Global, Module } from '@nestjs/common';
import { CvaBeneficiaryModule } from './beneficiary/beneficiary.module';
import { CvaVendorModule } from './vendor/vendor.module';

const DEFAULT_MODULES = [CvaBeneficiaryModule, CvaVendorModule];

@Global()
@Module({})
export class RahatCvaModule {
  static registerDefaultModules(): DynamicModule {
    return {
      module: RahatCvaModule,
      imports: DEFAULT_MODULES,
      exports: DEFAULT_MODULES,
    };
  }

  static registerCustomModules(modules: any[]): DynamicModule {
    return {
      module: RahatCvaModule,
      imports: modules,
      exports: modules,
    };
  }
}
