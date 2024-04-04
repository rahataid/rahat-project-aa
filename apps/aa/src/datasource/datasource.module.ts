import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { BipadService } from "./bipad.service";
import { GlofasService } from "./glofas.service";

@Module({
    imports: [HttpModule],
    providers: [BipadService, GlofasService],
    exports: [BipadService, GlofasService]
})
export class DataSourceModule { }
