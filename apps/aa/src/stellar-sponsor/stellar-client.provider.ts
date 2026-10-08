import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import { StellarClient, StellarClientConfig } from '@rahataid/stellar';

/**
 * Hands out a StellarClient built from the current STELLAR_SPONSOR_SETTINGS. Settings are read on
 * every call and the client is rebuilt only when they changed, so editing the asset/secret/network
 * takes effect on the next job without restarting the app.
 */
@Injectable()
export class StellarClientProvider {
  private readonly logger = new Logger(StellarClientProvider.name);
  private cached: { key: string; client: StellarClient } | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async get(): Promise<StellarClient> {
    const settings = await this.settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
    if (!settings?.value) throw new Error('STELLAR_SPONSOR_SETTINGS not configured');

    const key = JSON.stringify(settings.value);
    if (this.cached?.key === key) return this.cached.client;

    const client = new StellarClient(settings.value as unknown as StellarClientConfig);
    const replacing = this.cached !== null;
    this.cached = { key, client };

    if (replacing) {
      this.logger.log(`STELLAR_SPONSOR_SETTINGS changed — using ${client.asset.getCode()}:${client.asset.getIssuer()}`);
      // best-effort: the sponsor wallet must trust the new asset before it can send it
      await client
        .ensureSponsorTrustline()
        .catch((err) => this.logger.warn(`Could not ensure sponsor trustline for new asset: ${err.message}`));
    }
    return client;
  }
}
