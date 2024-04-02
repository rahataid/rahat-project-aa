import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { BipadService } from "./bipad.service";

@Module({
    imports: [HttpModule],
    providers: [BipadService],
    exports: [BipadService]
})
export class DataSourceModule { }
