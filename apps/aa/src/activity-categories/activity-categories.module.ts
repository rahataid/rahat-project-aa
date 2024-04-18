import { Module } from "@nestjs/common";
import { ActivityCategoriesController } from "./activitiy-categories.controller";
import { ActivityCategoriesService } from "./activity-categories.service";
import { PrismaModule } from "@rumsan/prisma";

@Module({
    imports: [PrismaModule],
    controllers: [ActivityCategoriesController],
    providers: [ActivityCategoriesService],
})
export class ActivityCategoriesModule { }
