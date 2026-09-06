import { DynamicModule, Global, Module } from '@nestjs/common';

import { ENV, NODE_PAYLOAD, TEnv } from './env';
import { INodePayload } from '../security/node-payload';

/** Env and SECRET_KEY payload, parsed once in main.ts. */
@Global()
@Module({})
export class ConfigModule {
    static register(env: TEnv, payload: INodePayload): DynamicModule {
        return {
            module: ConfigModule,
            providers: [
                { provide: ENV, useValue: env },
                { provide: NODE_PAYLOAD, useValue: payload },
            ],
            exports: [ENV, NODE_PAYLOAD],
        };
    }
}
