export const CVA_JOBS = {
  COMMUNICATION: {
    CREATE: 'rahat.jobs.communication.create',
  },
  GROUP: {
    CREATE: 'rahat.jobs.group.create',
    LIST: 'rahat.jobs.group.list',
    GET: 'rahat.jobs.group.get',
  },
  BENEFICIARY_GROUP: {
    BULK_ASSIGN: 'rahat.jobs.beneficiary_group.bulk_assign',
    LIST: 'rahat.jobs.beneficiary_group.list',
    LIST_BY_GROUP: 'rahat.jobs.beneficiary_group.lis_by_group',
  },
  DISBURSEMENT: {
    CREATE: 'rahat.jobs.disbursement.create',
    LIST: 'rahat.jobs.disbursement.list',
    GET: 'rahat.jobs.disbursement.get',
  },
  BENEFICIARY: {
    OFFLINE: {
      CREATE: 'rahat.jobs.beneficiary.offline.create',
      LIST: 'rahat.jobs.beneficiary.offline.list',
      GET: 'rahat.jobs.beneficiary.offline.get',
    },
    ADD_TO_PROJECT: 'rahat.jobs.beneficiary.add_to_project',
    CREATE: 'rahat.jobs.beneficiary.create',
    LIST: 'rahat.jobs.beneficiary.list',
    GET: 'rahat.jobs.beneficiary.get',
    GET_PROJECT_SPECIFIC: 'rahat.jobs.beneficiary.get_project_specific',
    LIST_BY_PROJECT: 'rahat.jobs.beneficiary.list_by_project',
    LIST_PROJECT_PII: 'rahat.jobs.beneficiary.list_project_pii',
    REDEEM: {
      CREATE: 'rahat.jobs.beneficiary.redeem.create',
      LIST: 'rahat.jobs.beneficiary.redeem.list',
      GET: 'rahat.jobs.beneficiary.redeem.get',
    },
    OTP: {
      CREATE: 'rahat.jobs.beneficiary.otp.create',
      GET: 'rahat.jobs.beneficiary.otp.get',
    },
  },
  VENDOR: {
    REIMBURSE: {
      CREATE: 'rahat.jobs.vendor.reimburse.create',
      LIST: 'rahat.jobs.vendor.reimburse.list',
      GET: 'rahat.jobs.vendor.reimburse.get',
    },
    GET: 'rahat.jobs.vendor.get',
    LIST: 'rahat.jobs.vendor.list',
    LIST_WITH_PROJECT_DATA: 'rahat.jobs.vendor.list_with_project_data',
    CREATE: 'rahat.jobs.vendor.create',
    ADD_TO_PROJECT: 'rahat.jobs.vendor.add_to_project',
  },
};

export const CVA_EVENTS = {
  DISBURSEMENT: {
    INITIATED: 'events.disbursement.initiated',
  },
  BENEFICIARY: {
    CREATED: 'events.beneficiary.created',
  },
  VENDOR: {
    CREATED: 'events.vendor.created',
  },
};
