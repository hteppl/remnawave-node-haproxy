import { Global, Module } from '@nestjs/common';

import { NetworkStatsService } from './utils/network-stats.service';

@Global()
@Module({
    providers: [NetworkStatsService],
    exports: [NetworkStatsService],
})
export class CommonModule {}
