export const DATA_SOURCES = {
  DHM: 'DHM',
  // GLOFAS: 'GLOFAS'
};

export const TRIGGER_ACTIVITY = {
  EMAIL: 'EMAIL'
}

export const JOBS = {
  RIVER_STATIONS: {
    GET_DHM: 'aa.jobs.riverStations.getDhm'
  },
  WATER_LEVELS: {
    GET_DHM: 'aa.jobs.waterLevels.getDhm'
  },
  SCHEDULE: {
    DEV_ONLY: 'aa.jobs.schedule.devOnly',
    GET_ALL: 'aa.jobs.schedule.getAll',
    ADD: 'aa.jobs.schedule.add',
    REMOVE: 'aa.jobs.schedule.remove'
  },
  ACTIVITIES: {
    GET_ALL: 'aa.jobs.activities.getAll',
    ADD: 'aa.jobs.activities.add',
    REMOVE: 'aa.jobs.activities.remove'
  },
  HAZARD_TYPES: {
    GET_ALL: 'aa.jobs.hazardTypes.getAll',
  },
};

export const EVENTS = {
  WATER_LEVEL_NOTIFICATION: 'events.water_level_notification',
};

export const BQUEUE = {
  SCHEDULE: 'SCHEDULE'
}