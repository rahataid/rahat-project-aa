import { BeneficiaryService } from './beneficiary.service';

// getStellarDisbursementMode is private and only needs settingsService and
// logger, so call it against a stub instead of building the whole service.
const modeFor = (settings: Record<string, unknown>) => {
  const settingsService = {
    getPublic: jest.fn(async (name: string) => {
      if (!(name in settings)) {
        throw new Error(`Public setting '${name}' not found`);
      }
      return { value: settings[name] };
    }),
  };
  const logger = { warn: jest.fn() };
  return (BeneficiaryService.prototype as any).getStellarDisbursementMode
    .call({ settingsService, logger })
    .then((mode: string) => ({ mode, settingsService, logger }));
};

describe('BeneficiaryService.getStellarDisbursementMode', () => {
  it('skips the Stellar setting for evm chains', async () => {
    const { mode, settingsService } = await modeFor({
      CHAIN_SETTINGS: { type: 'EVM' },
    });
    expect(mode).toBe('DIRECT');
    expect(settingsService.getPublic).not.toHaveBeenCalledWith(
      'STELLAR_DISBURSEMENT_SETTINGS'
    );
  });

  it('treats missing CHAIN_SETTINGS as evm and logs it', async () => {
    const { mode, logger } = await modeFor({});
    expect(mode).toBe('DIRECT');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs and defaults to SDP when the Stellar setting is missing', async () => {
    const { mode, logger } = await modeFor({
      CHAIN_SETTINGS: { type: 'stellar' },
    });
    expect(mode).toBe('SDP');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('STELLAR_DISBURSEMENT_SETTINGS')
    );
  });

  it('reads the Stellar mode when configured', async () => {
    const { mode } = await modeFor({
      CHAIN_SETTINGS: { type: 'stellar' },
      STELLAR_DISBURSEMENT_SETTINGS: { STELLAR_DISBURSMENT_MODE: 'DIRECT' },
    });
    expect(mode).toBe('DIRECT');
  });
});
