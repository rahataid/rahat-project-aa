import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class GroupCashTransferService {
    private readonly logger = new Logger(GroupCashTransferService.name);
    constructor() {
        this.logger.log("GroupCashTransferService initialized");
    }
}