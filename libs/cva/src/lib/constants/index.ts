export const CVA_JOBS = {
  DISBURSEMENT: {
    CREATE: 'rahat.jobs.disbursement.create',
    LIST: 'rahat.jobs.disbursement.list',
    GET: 'rahat.jobs.disbursement.get',
  },
  BENEFICIARY: {
    ADD_TO_PROJECT: 'rahat.jobs.beneficiary.add_to_project',
    CREATE: 'rahat.jobs.beneficiary.create',
    LIST: 'rahat.jobs.beneficiary.list',
    GET: 'rahat.jobs.beneficiary.get',
    GET_PROJECT_SPECIFIC: 'rahat.jobs.beneficiary.get_project_specific',
    LIST_BY_PROJECT: 'rahat.jobs.beneficiary.list_by_project',
    LIST_PROJECT_PII: 'rahat.jobs.beneficiary.list_project_pii',
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
