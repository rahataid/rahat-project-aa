export const NAMESPACE = 'rahat.projects';

export const DATA_SOURCES = {
  DHM: 'DHM',
  MANUAL: 'MANUAL',
  // GLOFAS: 'GLOFAS'
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
  BENEFICIARY: {
    CREATE: 'rahat.jobs.beneficiary.create',
    LIST: 'rahat.jobs.beneficiary.list',
    LIST_PROJECT_PII: 'rahat.jobs.beneficiary.list_project_pii',
    GET: 'rahat.jobs.beneficiary.get',
    UPDATE: 'rahat.jobs.beneficiary.update',
    REFER: 'rahat.jobs.beneficiary.get_referred',
    ADD_TO_PROJECT: 'rahat.jobs.beneficiary.add_to_project',
    BULK_ASSIGN_TO_PROJECT: 'rahat.jobs.beneficiary.bulk_assign',
    REMOVE: 'rahat.jobs.beneficiary.remove',
    ADD_GROUP: 'aa.jobs.beneficiary.addGroup',
    ASSIGN_TOKEN_TO_GROUP: 'aa.jobs.beneficiary.assign_token_to_group'
  },
  RIVER_STATIONS: {
    GET_DHM: 'aa.jobs.riverStations.getDhm',
  },
  WATER_LEVELS: {
    GET_DHM: 'aa.jobs.waterLevels.getDhm',
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
    REACHED_THRESHOLD: 'aa.jobs.triggers.reachedThreshold'
  },
  ACTIVITIES: {
    GET_ONE: 'aa.jobs.activities.getOne',
    GET_ALL: 'aa.jobs.activities.getAll',
    ADD: 'aa.jobs.activities.add',
    REMOVE: 'aa.jobs.activities.remove',
    UPDATE: 'aa.jobs.activities.update',
    UPDATE_STATUS: 'aa.jobs.activities.updateStatus',
  },
  COMMUNICATION: {
    ADD: 'aa.jobs.activity.communication.add',
    TRIGGER: 'aa.jobs.activity.communication.trigger',
  },
  ACTIVITY_CATEGORIES: {
    GET_ALL: 'aa.jobs.activityCategories.getAll',
    ADD: 'aa.jobs.activityCategories.add',
    REMOVE: 'aa.jobs.activityCategories.remove',
  },
  HAZARD_TYPES: {
    GET_ALL: 'aa.jobs.hazardTypes.getAll',
  },
  PHASES: {
    GET_ONE: 'aa.jobs.phases.getOne',
    GET_ALL: 'aa.jobs.phases.getAll',
    GET_STATS: 'aa.jobs.phases.getStats',
    ADD_TRIGGERS: 'aa.jobs.phases.addTriggers',
  },
  STAKEHOLDERS: {
    GET_ALL: 'aa.jobs.stakeholders.getAll',
    ADD: 'aa.jobs.stakeholders.add',
    REMOVE: 'aa.jobs.stakeholders.remove',
    UPDATE: 'aa.jobs.stakeholders.update',
    GET_ALL_GROUPS: 'aa.jobs.stakeholders.getAllGroups',
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
    INCREASE_BUDGET: 'aa.jobs.contract.increaseBudget'
  }
};

export const EVENTS = {
  WATER_LEVEL_NOTIFICATION: 'events.water_level_notification',
};

export const BQUEUE = {
  SCHEDULE: 'SCHEDULE',
  TRIGGER: 'TRIGGER'
};
