import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CashTrackerController } from './cash-tracker.controller';
import { CashTrackerService } from './cash-tracker.service';
import { SettingsService } from '@rumsan/settings';
import { PrismaModule } from '@rumsan/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [CashTrackerController],
  providers: [CashTrackerService],
  exports: [CashTrackerService],
})
export class CashTrackerModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly cashTrackerService: CashTrackerService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService
  ) {}

  async onModuleInit() {
    try {
      // Get settings from database
      const networkConfig = await this.getNetworkConfig();
      const contractsConfig = await this.getContractsConfig();

      // Initialize the service with configuration
      await this.cashTrackerService.initialize({
        network: networkConfig,
        contracts: contractsConfig,
      });

      // Load entities from database
      await this.loadEntitiesFromDatabase();

      console.log('Cash Tracker Module initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Cash Tracker Module:', error);
      // Don't throw error to prevent app from crashing
    }
  }

  async onModuleDestroy() {
    try {
      await this.cashTrackerService.cleanup();
      console.log('Cash Tracker Module cleaned up successfully');
    } catch (error) {
      console.error('Failed to cleanup Cash Tracker Module:', error);
    }
  }

  private async getNetworkConfig() {
    try {
      // Get RPC URL from database or fallback to environment
      const chainSettings = await this.settingsService.getPublic(
        'CHAIN_SETTINGS'
      );
      const rpcUrl = (chainSettings?.value as any)?.rpcUrl;
      console.log('first', rpcUrl);

      // Get entry point from database or fallback to environment
      const entryPointSetting = await this.settingsService.getPublic(
        'ENTRY_POINT'
      );
      const entryPoint =
        (entryPointSetting?.value as string) ||
        this.configService.get<string>('CASH_TRACKER_ENTRY_POINT') ||
        '0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b';

      return {
        rpcUrl,
        entryPoint,
      };
    } catch (error) {
      console.error('Failed to get network config from database:', error);
      // Fallback to environment variables
      return {
        rpcUrl:
          this.configService.get<string>('CASH_TRACKER_RPC_URL') ||
          'https://sepolia.base.org',
        entryPoint:
          this.configService.get<string>('CASH_TRACKER_ENTRY_POINT') ||
          '0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b',
      };
    }
  }

  private async getContractsConfig() {
    try {
      // Get cash token contract from database or fallback to environment
      const cashTokenSetting = await this.settingsService.getPublic(
        'CASH_TOKEN_CONTRACT'
      );
      const cashToken =
        (cashTokenSetting?.value as string) ||
        this.configService.get<string>('CASH_TRACKER_CONTRACT_ADDRESS');

      // Get smart account factory from environment (no database setting for this yet)
      const smartAccountFactory = this.configService.get<string>(
        'CASH_TRACKER_FACTORY_ADDRESS'
      );

      return {
        cashToken,
        smartAccountFactory,
      };
    } catch (error) {
      console.error('Failed to get contracts config from database:', error);
      // Fallback to environment variables
      return {
        cashToken: this.configService.get<string>(
          'CASH_TRACKER_CONTRACT_ADDRESS'
        ),
        smartAccountFactory: this.configService.get<string>(
          'CASH_TRACKER_FACTORY_ADDRESS'
        ),
      };
    }
  }

  private async loadEntitiesFromDatabase() {
    try {
      // Get entities from database
      const entitiesSetting = await this.settingsService.getPublic('ENTITIES');

      if (!entitiesSetting?.value) {
        console.warn('No entities found in database settings');
        return;
      }

      const entities = entitiesSetting.value as Array<{
        alias: string;
        address: string;
        privateKey: string;
        smartAccount: string;
      }>;

      if (!Array.isArray(entities)) {
        console.error('Invalid entities format in database');
        return;
      }

      // Transform entities to match the expected format
      const transformedEntities = entities.map((entity) => ({
        privateKey: entity.privateKey,
        address: entity.address,
        smartAccount: entity.smartAccount,
        alias: entity.alias,
        role: this.getRoleFromAlias(entity.alias), // Map alias to role
      }));

      await this.cashTrackerService.loadEntities(transformedEntities);
      console.log(
        `Loaded ${transformedEntities.length} entities from database`
      );
    } catch (error) {
      console.error('Failed to load entities from database:', error);
    }
  }

  private getRoleFromAlias(alias: string): string {
    // Map aliases to roles based on the new database structure
    const roleMap: Record<string, string> = {
      Alice: 'UNICEF_NEPAL_CO',
      Bob: 'UNICEF_NEPAL_FIELD_OFFICE',
      Charlie: 'MUNICIPALITY',
    };

    return roleMap[alias] || 'BENEFICIARY'; // Default to BENEFICIARY if no mapping found
  }
}
