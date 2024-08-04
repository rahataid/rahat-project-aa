import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { lastValueFrom } from "rxjs";
import { getClient, ApiClient, SessionClient, BroadcastClient, BroadcastLogClient, TransportClient } from "@rumsan/connect/src/clients"
import { AxiosHeaderValue } from "axios";

const GET_COMMUNICATION_SETTINGS = "appJobs.communication.getSettings"

export type CommsClient = {
    apiClient: ApiClient;
    setAppId: (appId: string) => string;
    setAccessToken: (token: string) => string;
    setHeaders: (headers: {
        [key: string]: AxiosHeaderValue;
    }) => {
        [key: string]: AxiosHeaderValue;
    };
    session: SessionClient;
    broadcast: BroadcastClient;
    broadcastLog: BroadcastLogClient;
    transport: TransportClient;
}

@Injectable()
export class CommsService {

    private client: CommsClient;
    private logger = new Logger(CommsService.name)

    constructor(@Inject("CORE_CLIENT") private readonly coreClient: ClientProxy) { }

    async init() {
        const [communicationSettings] = await lastValueFrom(
            this.coreClient.send({ cmd: GET_COMMUNICATION_SETTINGS }, {})
        )

        if (!communicationSettings) {
            this.logger.error("Communication Settings not found.")
            process.exit(1)
        }
        this.client = getClient({
            baseURL: communicationSettings.value["URL"]
        })
        this.client.setAppId(communicationSettings.value["APP_ID"])
    }

    async getClient() {
        if (!this.client) {
            await this.init()
            return this.client;
        }
        return this.client;
    }
}