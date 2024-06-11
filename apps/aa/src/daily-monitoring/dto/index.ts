export interface AddDailyMonitoringData {
    name: string;
    location: string;
    source: string;
    forecast: string;
    todayStatus?: string;
    tomorrowStatus?: string;
    dayAfterTomorrowStatus?: string;
    hours24Status?: string;
    hours48Status?: string;
    hours72Status?: string;
}

export interface GetDailyMonitoringData {
    page: number;
    perPage: number;
}

export interface GetOneMonitoringData {
    uuid: string;
}

export interface UpdateMonitoringData {
    uuid: string;
    name?: string;
    location?: string;
    source?: string;
    forecast?: string;
    todayStatus?: string;
    tomorrowStatus?: string;
    dayAfterTomorrowStatus?: string;
    hours24Status?: string;
    hours48Status?: string;
    hours72Status?: string;
}

export interface RemoveMonitoringData {
    uuid: string;
}