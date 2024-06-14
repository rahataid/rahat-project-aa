interface BaseForecast {
    source?: string;
    forecast?: string;
}

interface DHM extends BaseForecast {
    todayStatus?: string;
    tomorrowStatus?: string;
    dayAfterTomorrowStatus?: string;
}

interface NCMWRF extends BaseForecast {
    hours24Status?: string;
    hours48Status?: string;
    hours72Status?: string;
}

export interface AddDailyMonitoringData {
    dataEntryBy: string;
    location: string;
    data: Array<DHM | NCMWRF>;
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
}

export interface RemoveMonitoringData {
    uuid: string;
}