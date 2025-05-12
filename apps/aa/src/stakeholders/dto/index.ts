export interface AddStakeholdersData {
  name: string;
  email: string;
  phone: string;
  designation: string;
  organization: string;
  district: string;
  municipality: string;
}

export interface UpdateStakeholdersData {
  uuid: string;
  name?: string;
  email?: string;
  phone?: string;
  designation?: string;
  organization?: string;
  district?: string;
  municipality?: string;
}

export interface RemoveStakeholdersData {
  uuid: string;
}

export interface GetStakeholdersData {
  name: string;
  designation: string;
  organization: string;
  district: string;
  municipality: string;
  page: number;
  order?: string;
  sort?: string;
  perPage: number;
}

export interface AddStakeholdersGroups {
  name: string;
  stakeholders: Array<{
    uuid: string;
  }>;
}

export interface UpdateStakeholdersGroups {
  uuid: string;
  name?: string;
  stakeholders?: Array<{
    uuid: string;
  }>;
}

export interface GetAllGroups {
  page: number;
  perPage: number;
  order?: string;
  sort?: string;
  search?: string;
}

export interface GetOneGroup {
  uuid: string;
}

export interface RemoveStakeholdersGroup {
  uuid: string;
}

export interface FindStakeholdersGroup {
  uuid: string;
}
