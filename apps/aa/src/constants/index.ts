import { STELLAR } from 'libs/stellar-sdk/src/constants/routes';

export const NAMESPACE = 'rahat.projects';

export const CORE_MODULE = 'RAHAT_CORE_PROJECT_CLIENT';
export const TRIGGGERS_MODULE = 'RAHAT_TRIGGERS_CLIENT';

export const STELLER_UID = 'stellar';

export const DATA_SOURCES = {
  DHM: 'DHM',
  MANUAL: 'MANUAL',
  GLOFAS: 'GLOFAS',
};

export const TRIGGER_ACTIVITY = {
  EMAIL: 'EMAIL',
};

export const CONTROLLERS = {
  VENDOR: {
    CREATE: NAMESPACE + '.vendor.create',
    LIST: NAMESPACE + '.vendor.list',
    LISTONE: NAMESPACE + '.vendor.listone',
    UPDATE: NAMESPACE + '.vendor.update',
    BLOCKCHAIN: NAMESPACE + '.vendor.blockchain',
  },
  BENEFICIARY: {
    CREATE: NAMESPACE + '.beneficiary.create',
    LIST: NAMESPACE + '.beneficiary.list',
    LISTONE: NAMESPACE + '.beneficiary.listone',
    UPDATE: NAMESPACE + '.beneficiary.update',
  },
  PAYOUTS: {
    CREATE: NAMESPACE + '.payouts.create',
    LIST: NAMESPACE + '.payouts.list',
    GET: NAMESPACE + '.payouts.get',
    UPDATE: NAMESPACE + '.payouts.update',
    REMOVE: NAMESPACE + '.payouts.remove',
  },
};

export const JOBS = {
  APP: {
    RESET_ALL: 'rahat.jobs.beneficiary.create',
  },
  PROJECT: {
    SETUP: 'rahat.jobs.project.setup',
    CREATE: 'rahat.jobs.project.create',
    LIST: 'rahat.jobs.project.list',
    GET: 'rahat.jobs.project.get',
    UPDATE: 'rahat.jobs.project.update',
    UPDATE_ADMIN: 'rahat.jobs.project.add_admin',
  },
  BENEFICIARY: {
    CREATE: 'rahat.jobs.beneficiary.create',
    LIST: 'rahat.jobs.beneficiary.list',
    LIST_PROJECT_PII: 'rahat.jobs.beneficiary.list_project_pii',
    GET: 'rahat.jobs.beneficiary.get',
    GET_ONE_BENEFICIARY: 'rahat.jobs.beneficiary.find_one_beneficiary',
    UPDATE: 'rahat.jobs.beneficiary.update',
    REFER: 'rahat.jobs.beneficiary.get_referred',
    ADD_TO_PROJECT: 'rahat.jobs.beneficiary.add_to_project',
    BULK_ASSIGN_TO_PROJECT: 'rahat.jobs.beneficiary.bulk_assign',
    REMOVE: 'rahat.jobs.beneficiary.remove',
    ADD_GROUP: 'aa.jobs.beneficiary.addGroup',
    RESERVE_TOKEN_TO_GROUP: 'aa.jobs.beneficiary.reserve_token_to_group',
    GET_ALL_GROUPS: 'aa.jobs.beneficiary.getAllGroups',
    GET_ONE_GROUP: 'aa.jobs.beneficiary.getOneGroup',
    ADD_GROUP_TO_PROJECT: 'rahat.jobs.beneficiary.add_group_to_project',
    GET_ALL_TOKEN_RESERVATION: 'aa.jobs.beneficiary.getAllTokenReservation',
    GET_ONE_TOKEN_RESERVATION: 'aa.jobs.beneficiary.getOneTokenReservation',
    GET_RESERVATION_STATS: 'aa.jobs.beneficiary.getReservationStats',
    GET_REDEEM_INFO: 'aa.jobs.beneficiary.getRedeemInfo',
  },
  RIVER_STATIONS: {
    GET_DHM: 'aa.jobs.riverStations.getDhm',
  },
  WATER_LEVELS: {
    GET_DHM: 'aa.jobs.waterLevels.getDhm',
    GET_GLOFAS: 'aa.jobs.waterLevels.getGlofas',
  },
  SCHEDULE: {
    ADD: 'aa.jobs.schedule.add',
  },
  TRIGGERS: {
    DEV_ONLY: 'aa.jobs.triggers.devOnly',
    GET_ALL: 'aa.jobs.triggers.getAll',
    GET_ONE: 'aa.jobs.triggers.getOne',
    ADD: 'aa.jobs.triggers.add',
    REMOVE: 'aa.jobs.triggers.remove',
    UPDATE: 'aa.jobs.triggers.update',
    ACTIVATE: 'aa.jobs.triggers.activate',
    REACHED_THRESHOLD: 'aa.jobs.triggers.reachedThreshold',
    COMMS_TRIGGER: 'aa.jobs.triggers.commsTrigger',
  },
  STELLAR: {
    DISBURSE: 'aa.jobs.stellar.disburse',
    DISBURSEMENT_QUEUE: `aa.jobs.stellar.disburse`,
    SEND_OTP: 'aa.jobs.stellar.sendOtp',
    SEND_ASSET_TO_VENDOR: 'aa.jobs.stellar.sendAssetToVendor',
    SEND_ASSET_TO_VENDOR_BY_WALLET: `aa.jobs.stellar.sendAssetWithAddress`,
    FUND_STELLAR_ACCOUNT: 'aa.jobs.stellar.fundStellarAccount',
    CHECK_TRUSTLINE: 'aa.jobs.stellar.checkTrustline',
    CHECK_BULK_TRUSTLINE: 'aa.jobs.stellar.checkBulkTrustline',
    CHECK_BULK_TRUSTLINE_QUEUE: `aa.jobs.stellar.checkBulkTrustlineQueue`,
    ADD_ONCHAIN_TRIGGER: 'aa.jobs.stellar.addTriggerOnChain',
    UPDATE_ONCHAIN_TRIGGER: 'aa.jobs.stellar.updateTriggerOnChain',
    ADD_ONCHAIN_TRIGGER_QUEUE: `aa.jobs.stellar.getTriggerOnChainQueue`,
    UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE: `aa.jobs.stellar.updateTriggerParamsOnChainQueue`,
    DISBURSE_ONCHAIN_QUEUE: `aa.jobs.stellar.disburseOnChainQueue`,
    DISBURSEMENT_STATUS_UPDATE: `aa.jobs.stellar.disburse_status_update`,
    GET_ONCHAIN_TRIGGER: 'aa.jobs.stellar.getTriggerOnChain',
    GET_STELLAR_STATS: 'aa.jobs.stellar.getStellarStats',
    GET_TRANSACTIONS: 'aa.jobs.stellar.getTransactions',
    FAUCET_TRUSTLINE: 'aa.jobs.stellar.faucetTrustline',
    INTERNAL_FAUCET_TRUSTLINE_QUEUE: `aa.jobs.stellar.internalFaucetTrustlineQueue`,
    INTERNAL_FAUCET_TRUSTLINE: `aa.jobs.stellar.internalFaucetTrustline`,
    GET_WALLET_BALANCE: 'aa.jobs.stellar.getWalletBalance',
    GET_VENDOR_STATS: 'aa.jobs.stellar.getVendorStats',
    TRANSFER_TO_OFFRAMP: `aa.jobs.stellar.transferToOfframp`,
    GET_REDEMPTION_REQUEST: 'aa.jobs.stellar.getRedemptionRequest',
    RAHAT_FAUCET: 'aa.jobs.stellar.rahatFaucet',
  },
  OFFRAMP: {
    CREATE_OFFRAMP: 'aa.jobs.offramp.createOfframp',
    EXECUTE_OFFRAMP: 'aa.jobs.offramp.executeOfframp',
    LIST_OFFRAMP: 'aa.jobs.offramp.listOfframp',
    GET_OFFRAMP: 'aa.jobs.offramp.getOfframp',
    INSTANT_OFFRAMP: `aa.jobs.offramp.instantOfframp`,
  },
  PAYOUT: {
    ASSIGN_TOKEN: 'aa.jobs.payout.assignToken',
    TRIGGER_PAYOUT: 'aa.jobs.payout.triggerPayout',
    TRIGGER_FAILED_PAYOUT_REQUEST: 'aa.jobs.payout.triggerFailedPayoutRequest',
    TRIGGER_ONE_FAILED_PAYOUT_REQUEST:
      'aa.jobs.payout.triggerOneFailedPayoutRequest',
    GET_PAYOUT_LOGS: 'aa.jobs.payout.getPayoutLogs',
    GET_PAYOUT_LOG: 'aa.jobs.payout.getPayoutLog',
    GET_PAYOUT_DETAILS: 'aa.jobs.payout.getPayoutDetails',
    CREATE: 'aa.jobs.payout.create',
    LIST: 'aa.jobs.payout.list',
    GET: 'aa.jobs.payout.get',
    GET_STATS: 'aa.jobs.payout.get_stats',
    UPDATE: 'aa.jobs.payout.update',
    GET_PAYMENT_PROVIDERS: 'aa.jobs.payout.getPaymentProviders',
    EXPORT_PAYOUT_LOGS: 'aa.jobs.payout.exportPayoutLogs',
  },
  ACTIVITIES: {
    GET_ONE: 'aa.jobs.activities.getOne',
    GET_ALL: 'aa.jobs.activities.getAll',
    GET_HAVING_COMMS: 'aa.jobs.activities.getHavingComms',
    ADD: 'aa.jobs.activities.add',
    REMOVE: 'aa.jobs.activities.remove',
    UPDATE: 'aa.jobs.activities.update',
    UPDATE_STATUS: 'aa.jobs.activities.updateStatus',
    COMMUNICATION: {
      TRIGGER: 'aa.jobs.activity.communication.trigger',
      SESSION_LOGS: 'aa.jobs.activities.communication.sessionLogs',
      RETRY_FAILED: 'aa.jobs.activities.communication.retryFailed',
      GET_STATS: 'aa.jobs.activities.communication.getStats',
    },
  },
  ACTIVITY_CATEGORIES: {
    GET_ALL: 'aa.jobs.activityCategories.getAll',
    ADD: 'aa.jobs.activityCategories.add',
    REMOVE: 'aa.jobs.activityCategories.remove',
  },
  PHASES: {
    GET_ONE: 'aa.jobs.phases.getOne',
    GET_ALL: 'aa.jobs.phases.getAll',
    GET_STATS: 'aa.jobs.phases.getStats',
    ADD_TRIGGERS: 'aa.jobs.phases.addTriggers',
    REVERT_PHASE: 'aa.jobs.phases.revertPhase',
  },
  STAKEHOLDERS: {
    GET_ALL: 'aa.jobs.stakeholders.getAll',
    GET_ONE: 'aa.jobs.stakeholders.getOne',
    ADD: 'aa.jobs.stakeholders.add',
    BULK_ADD: 'aa.jobs.stakeholders.bulkAdd',
    REMOVE: 'aa.jobs.stakeholders.remove',
    UPDATE: 'aa.jobs.stakeholders.update',
    GET_ALL_GROUPS: 'aa.jobs.stakeholders.getAllGroups',
    GET_ONE_GROUP: 'aa.jobs.stakeholders.getOneGroup',
    ADD_GROUP: 'aa.jobs.stakeholders.addGroup',
    UPDATE_GROUP: 'aa.jobs.stakeholders.updateGroup',
    DELETE_GROUP: 'aa.jobs.stakeholders.deleteGroup',
  },
  SETTINGS: {
    CREATE: 'rahat.jobs.settings.create',
    LIST: 'rahat.jobs.settings.list',
    GET: 'rahat.jobs.settings.get',
    UPDATE: 'rahat.jobs.settings.update',
    REMOVE: 'rahat.jobs.settings.remove',
  },
  CONTRACT: {
    INCREASE_BUDGET: 'aa.jobs.contract.increaseBudget',
  },
  STATS: {
    GET_ALL: 'aa.jobs.stats.getAll',
    GET_ONE: 'aa.jobs.stats.getOne',
    MS_TRIGGERS_STATS: 'rahat.jobs.ms.trigggers.stats',
  },
  DAILY_MONITORING: {
    ADD: 'aa.jobs.dailyMonitoring.add',
    GET_ALL: 'aa.jobs.dailyMonitoring.getAll',
    GET_ONE: 'aa.jobs.dailyMonitoring.getOne',
    UPDATE: 'aa.jobs.dailyMonitoring.update',
    REMOVE: 'aa.jobs.dailyMonitoring.remove',
  },
  VENDOR: {
    REIMBURSE: {
      CREATE: 'rahat.jobs.vendor.reimburse.create',
      LIST: 'rahat.jobs.vendor.reimburse.list',
      GET: 'rahat.jobs.vendor.reimburse.get',
    },
    CREATE_TOKEN_REDEMPTION: 'aa.jobs.vendor.token_redemption.create',
    GET_TOKEN_REDEMPTION: 'aa.jobs.vendor.token_redemption.get',
    UPDATE_TOKEN_REDEMPTION_STATUS:
      'aa.jobs.vendor.token_redemption.update_status',
    LIST_TOKEN_REDEMPTIONS: 'aa.jobs.vendor.token_redemption.list',
    GET_VENDOR_REDEMPTIONS:
      'aa.jobs.vendor.token_redemption.get_vendor_redemptions',
    GET_TOKEN_REDEMPTION_STATS: 'aa.jobs.vendor.token_redemption.get_stats',
    VERIFY_TOKEN_REDEMPTION: 'aa.jobs.vendor.token_redemption.verify',
    GET: 'rahat.jobs.vendor.get',
    LIST: 'rahat.jobs.vendor.list',
    LIST_WITH_PROJECT_DATA: 'rahat.jobs.vendor.list_with_project_data',
    GET_BENEFICIARIES: 'rahat.jobs.vendor.get_beneficiaries',
    CREATE: 'rahat.jobs.vendor.create',
    ADD_TO_PROJECT: 'rahat.jobs.vendor.add_to_project',
  },
};

export const EVENTS = {
  PHASE_ACTIVATED: 'events.phase_activated',
  PHASE_REVERTED: 'events.phase_reverted',
  ACTIVITY_COMPLETED: 'events.activity_completed',
  ACTIVITY_DELETED: 'events.activity_deleted',
  ACTIVITY_ADDED: 'events.activity_added',
  BENEFICIARY_CREATED: 'events.beneficiary_created',
  BENEFICIARY_REMOVED: 'events.beneficiary_updated',
  BENEFICIARY_UPDATED: 'events.beneficiary_updated',
  AUTOMATED_TRIGGERED: 'events.automated_triggered',
  TOKEN_RESERVED: 'events.token_reserved',
  STAKEHOLDER_UPDATED: 'events.stakeholders_updated',
  STAKEHOLDER_CREATED: 'events.stakeholders_created',
  STAKEHOLDER_REMOVED: 'events.stakeholders_removed',
  TOKEN_DISBURSED: 'events.token_disbursed',
};

export const BQUEUE = {
  SCHEDULE: `SCHEDULE_${process.env.PROJECT_ID}`,
  TRIGGER: `TRIGGER_${process.env.PROJECT_ID}`,
  CONTRACT: `CONTRACT_${process.env.PROJECT_ID}`,
  COMMUNICATION: `COMMUNICATION_${process.env.PROJECT_ID}`,
  STELLAR: `STELLAR_${process.env.PROJECT_ID}`,
  STELLAR_CHECK_TRUSTLINE: `STELLAR_CHECK_TRUSTLINE_${process.env.PROJECT_ID}`,
  OFFRAMP: `OFFRAMP_${process.env.PROJECT_ID}`,
  VENDOR: `VENDOR_${process.env.PROJECT_ID}`,
};

export const VULNERABILITY_FIELD = {
  HOW_MANY_LACTATING: 'if_yes_how_many_lactating',
  HOW_MANY_PREGNANT: 'if_yes_how_many_pregnant',
  TYPE_OF_SSA_1: 'type_of_ssa_1',
  TYPE_OF_SSA_2: 'type_of_ssa_2',
  TYPE_OF_SSA_3: 'type_of_ssa_3',
};

export const TYPE_OF_SSA = {
  SENIOR_CITIZEN_ABOVE_70: 'senior_citizen__70',
  SENIOR_CITIZEN_DALIT_ABOVE_60: 'senior_citizen__60__dalit',
  CHILD_NUTRITION: 'child_nutrition',
  SINGLE_WOMEN: 'single_woman',
  WIDOW: 'widow',
  RED_CARD: 'red_class',
  BLUE_CARD: 'blue_card',
  INDIGENOUS_COMMUNITY: 'indigenous_community',
};

export const AGE_GROUPS = {
  BELOW_20: '<20',
  AGE_19_TO_29: '20-29',
  AGE_30_TO_45: '30-45',
  AGE_46_TO_59: '46-59',
  ABOVE_60: '>60',
};

export const FIELD_MAP = {
  NO_OF_LACTATING_WOMEN: 'no_of_lactating_women',
  NO_OF_PERSONS_WITH_DISABILITY: 'no_of_persons_with_disability',
  NO_OF_PREGNANT_WOMEN: 'no_of_pregnant_women',
};
