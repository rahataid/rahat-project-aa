export interface AddActivityCategory {
    name: string;
}

export interface RemoveActivityCategory {
    uuid: string
}

export interface GetActivityCategory {
    name: string;
    page: number;
    perPage: number;
}