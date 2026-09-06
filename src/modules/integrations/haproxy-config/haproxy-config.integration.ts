import { Injectable, Logger } from '@nestjs/common';

import {
    HAPROXY_CONFIG_SECTIONS,
    HaproxyConfigSchema,
    THaproxyConfig,
} from '../../../contract/relay-config.schema';
import {
    INodeIntegration,
    INodeIntegrationResult,
    INodeIntegrationSyncOptions,
} from '../integrations.contract';

export const HAPROXY_INTEGRATION_KEY = 'haproxy';

/**
 * The node's entire HAProxy config, and the only source of it. See
 * `examples/node-integration.json` for the shape.
 */
@Injectable()
export class HaproxyConfigIntegration implements INodeIntegration {
    public readonly name = 'haproxy-config';

    private readonly logger = new Logger(HaproxyConfigIntegration.name);

    private config: THaproxyConfig | null = null;

    public async sync({
        integrationConfig,
    }: INodeIntegrationSyncOptions): Promise<INodeIntegrationResult> {
        const raw = integrationConfig[HAPROXY_INTEGRATION_KEY];

        if (raw === undefined || raw === null) {
            this.config = null;

            return {
                error:
                    `No "${HAPROXY_INTEGRATION_KEY}" key in this node's integrations. Attach a node ` +
                    'integration carrying the HAProxy config to it in the panel.',
            };
        }

        const parsed = HaproxyConfigSchema.safeParse(raw);

        if (!parsed.success) {
            // Never relay on a stale config.
            this.config = null;

            const issues = parsed.error.issues
                .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
                .join('; ');

            return { error: `Invalid "${HAPROXY_INTEGRATION_KEY}" integration config: ${issues}` };
        }

        // The schema drops unknown keys; surface them so a typo isn't silent.
        const unknown = Object.keys(raw as Record<string, unknown>).filter(
            (key) => !HAPROXY_CONFIG_SECTIONS.includes(key as (typeof HAPROXY_CONFIG_SECTIONS)[number]),
        );
        if (unknown.length > 0) {
            this.logger.warn(
                `Ignoring unknown key(s) in the "${HAPROXY_INTEGRATION_KEY}" integration config: ` +
                    `${unknown.join(', ')}. Known sections: ${HAPROXY_CONFIG_SECTIONS.join(', ')}.`,
            );
        }

        this.config = parsed.data;
        this.logger.log(
            `Config from integrations: ${parsed.data.frontends.length} frontend(s), ` +
                `${parsed.data.backends.length} backend(s).`,
        );

        return { error: null };
    }

    /** Null until a sync succeeds. */
    public getConfig(): THaproxyConfig | null {
        return this.config;
    }

    public async stop(): Promise<void> {
        this.config = null;
    }
}
