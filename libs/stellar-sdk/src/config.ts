export interface SdkConfig {
  processUrl: string;
  receiverUrl: string;
  baseUrl: string;
  adminBaseUrl: string;
  friendbotUrl: string;
}

export class SdkConfigManager {
  private static instance: SdkConfigManager;
  private config: SdkConfig | null = null;

  private constructor() {}

  public static getInstance(): SdkConfigManager {
    if (!SdkConfigManager.instance) {
      SdkConfigManager.instance = new SdkConfigManager();
    }
    return SdkConfigManager.instance;
  }

  public initialize(config: SdkConfig): void {
    this.config = config;
  }
  public getConfig(): SdkConfig {
    if (!this.config) {
      throw new Error(
        'SDK not initialized. Call initialize() with configuration first.'
      );
    }
    return this.config;
  }
}
