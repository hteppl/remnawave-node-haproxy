import { Global, Module, Type } from '@nestjs/common';

import { HaproxyConfigIntegration } from './haproxy-config/haproxy-config.integration';
import { INodeIntegration, NODE_INTEGRATIONS } from './integrations.contract';
import { IntegrationsService } from './integrations.service';

/** Manual registry; upstream discovers these at build time. */
const INTEGRATIONS: Type<INodeIntegration>[] = [HaproxyConfigIntegration];

@Global()
@Module({
    providers: [
        ...INTEGRATIONS,
        IntegrationsService,
        {
            provide: NODE_INTEGRATIONS,
            useFactory: (...integrations: INodeIntegration[]) => integrations,
            inject: INTEGRATIONS,
        },
    ],
    exports: [IntegrationsService, HaproxyConfigIntegration],
})
export class IntegrationsModule {}
