import { DynamicModule, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { HandlerModule } from './modules/handler/handler.module';
import { HaproxyModule } from './modules/haproxy/haproxy.module';
import { INodePayload } from './security/node-payload';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { PluginModule } from './modules/plugin/plugin.module';
import { RelayModule } from './modules/relay/relay.module';
import { StatsModule } from './modules/stats/stats.module';
import { TEnv } from './config/env';

@Module({})
export class AppModule {
    static register(env: TEnv, payload: INodePayload): DynamicModule {
        return {
            module: AppModule,
            imports: [
                ConfigModule.register(env, payload),
                PassportModule,
                CommonModule,
                HaproxyModule,
                IntegrationsModule,
                RelayModule,
                StatsModule,
                HandlerModule,
                PluginModule,
            ],
            providers: [JwtStrategy],
        };
    }
}
