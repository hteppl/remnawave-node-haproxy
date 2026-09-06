import { Module } from '@nestjs/common';

import { RelayModule } from '../relay/relay.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
    imports: [RelayModule],
    controllers: [StatsController],
    providers: [StatsService],
})
export class StatsModule {}
