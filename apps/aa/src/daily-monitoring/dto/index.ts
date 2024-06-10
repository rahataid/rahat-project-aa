export interface Status {
    todayStatus?: string;
    tomorrowStatus?: string;
    dayAfterTomorrowStatus?: string;
    hours24Status?: string;
    hours48Status?: string;
    hours72Status?: string;
}

export interface AddDailyMonitoringData {
    name: string;
    location: string;
    source: string;
    forecast: string;
    status?: Status;
}

export interface GetDailyMonitoringData {
    page: number;
    perPage: number;
}