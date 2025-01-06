export const CVA_JOBS = {
  BENEFICIARY: {
    CREATE: 'rahat.jobs.beneficiary.create',
    LIST: 'rahat.jobs.beneficiary.list',
    GET: 'rahat.jobs.beneficiary.get',
    LIST_BY_PROJECT: 'rahat.jobs.beneficiary.list_by_project',
  },
  VENDOR: {
    GET: 'rahat.jobs.vendor.get',
    LIST: 'rahat.jobs.vendor.list',
    LIST_WITH_PROJECT_DATA: 'rahat.jobs.vendor.list_with_project_data',
    CREATE: 'rahat.jobs.vendor.create',
    ADD_TO_PROJECT: 'rahat.jobs.vendor.add_to_project',
  },
};

export const CVA_EVENTS = {
  BENEFICIARY: {
    CREATED: 'events.beneficiary.created',
  },
  VENDOR: {
    CREATED: 'events.vendor.created',
  },
};
