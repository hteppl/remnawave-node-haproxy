import { Global, Module } from '@nestjs/common';

import { HaproxyCliService } from './haproxy-cli.service';
import { HaproxyProcessService } from './haproxy-process.service';

@Global()
@Module({
    providers: [HaproxyProcessService, HaproxyCliService],
    exports: [HaproxyProcessService, HaproxyCliService],
})
export class HaproxyModule {}
