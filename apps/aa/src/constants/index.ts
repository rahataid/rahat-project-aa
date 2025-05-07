import { STELLAR } from 'libs/stellar-sdk/src/constants/routes';

export const NAMESPACE = 'rahat.projects';

export const CORE_MODULE = 'RAHAT_CORE_PROJECT_CLIENT';

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
    SEND_OTP: 'aa.jobs.stellar.sendOtp',
    SEND_ASSET_TO_VENDOR: 'aa.jobs.stellar.sendAssetToVendor',
    FUND_STELLAR_ACCOUNT: 'aa.jobs.stellar.fundStellarAccount',
    ADD_ONCHAIN_TRIGGER: 'aa.jobs.stellar.addTriggerOnChain',
    UPDATE_ONCHAIN_TRIGGER: 'aa.jobs.stellar.updateTriggerOnChain',
    ADD_ONCHAIN_TRIGGER_QUEUE: 'aa.jobs.stellar.getTriggerOnChainQueue',
    UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE:
      'aa.jobs.stellar.updateTriggerParamsOnChainQueue',
    GET_ONCHAIN_TRIGGER: 'aa.jobs.stellar.getTriggerOnChain',
    GET_STELLAR_STATS: 'aa.jobs.stellar.getStellarStats',
    GET_TRANSACTIONS: 'aa.jobs.stellar.getTransactions',
    FAUCET_TRUSTLINE: 'aa.jobs.stellar.faucetTrustline',
  },
  PAYOUT: {
    ASSIGN_TOKEN: 'aa.jobs.payout.assignToken',
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
  },
  DAILY_MONITORING: {
    ADD: 'aa.jobs.dailyMonitoring.add',
    GET_ALL: 'aa.jobs.dailyMonitoring.getAll',
    GET_ONE: 'aa.jobs.dailyMonitoring.getOne',
    UPDATE: 'aa.jobs.dailyMonitoring.update',
    REMOVE: 'aa.jobs.dailyMonitoring.remove',
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
};

export const BQUEUE = {
  SCHEDULE: 'SCHEDULE',
  TRIGGER: 'TRIGGER',
  CONTRACT: 'CONTRACT',
  COMMUNICATION: 'COMMUNICATION',
  STELLAR: 'STELLAR',
};

export const VULNERABILITY_FIELD = {
  HOW_MANY_LACTATING: 'if_yes_how_many_lactating',
  HOW_MANY_PREGNANT: 'if_yes_how_many_pregnant',
  TYPE_OF_SSA_1: 'type_of_ssa_1',
  TYPE_OF_SSA_2: 'type_of_ssa_2',
  TYPE_OF_SSA_3: 'type_of_ssa_3',
};
