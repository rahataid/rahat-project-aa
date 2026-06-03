import { Controller } from "@nestjs/common";
import { GroupCashTransferService } from "./group-cash-transfer.service";

@Controller()
export class GroupCashTransferController {
   constructor(private readonly groupCashTransferService: GroupCashTransferService) {} 
}