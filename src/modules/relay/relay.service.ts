import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { NetworkStatsService } from '../../common/utils/network-stats.service';
import { getSystemInfo, getSystemStats } from '../../common/utils/system-stats';
import { TNodeSystem } from '../../contract/schemas';
import { TStartRequest } from '../../contract/schemas';
import {
    ConfigBuildError,
    IFrontendMapping,
    buildHaproxyConfig,
} from '../haproxy/haproxy-config.builder';
import { HaproxyCliService } from '../haproxy/haproxy-cli.service';
import { HaproxyConfigIntegration } from '../integrations/haproxy-config/haproxy-config.integration';
import { HaproxyProcessService } from '../haproxy/haproxy-process.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { REPORTED_VERSION } from '../../version';

export interface IStartResult {
    isStarted: boolean;
    version: string | null;
    error: string | null;
    nodeInformation: { version: string | null };
    system: TNodeSystem;
}

/** Panel-facing lifecycle: config profile in, HAProxy kept in step with it. */
@Injectable()
export class RelayService {
    private readonly logger = new Logger(RelayService.name);

    private frontends: IFrontendMapping[] = [];
    private appliedConfigHash: string | null = null;
    private lastError: string | null = null;

    constructor(
        private readonly haproxy: HaproxyProcessService,
        private readonly haproxyCli: HaproxyCliService,
        private readonly networkStats: NetworkStatsService,
        private readonly integrations: IntegrationsService,
        private readonly haproxyConfig: HaproxyConfigIntegration,
    ) {}

    /** Frontend proxy name -> inbound tag, for attributing counters. */
    public getFrontends(): IFrontendMapping[] {
        return this.frontends;
    }

    public async start(body: TStartRequest): Promise<IStartResult> {
        const version = REPORTED_VERSION;

        try {
            // The node's integrations are the whole config; xrayConfig is ignored.
            const synced = await this.integrations.sync(
                body.internals.integrations,
                body.internals.metadata,
            );

            if (synced.error) {
                throw new ConfigBuildError(`Failed to sync integrations: ${synced.error}`);
            }

            const config = this.haproxyConfig.getConfig();

            if (!config) {
                throw new ConfigBuildError('Integrations carry no HAProxy config for this node.');
            }

            const built = buildHaproxyConfig(config, {
                runtime: {
                    statsSocket: this.haproxyCli.statsSocketPath,
                    bootstrapSocket: this.haproxy.bootstrapSocketPath,
                },
                node: body.internals.metadata,
            });

            for (const warning of built.warnings) {
                this.logger.warn(warning);
            }

            if (built.skipped.length > 0) {
                this.logger.log(
                    `Scoped to another relay node, not applied here: ${built.skipped.join(', ')}`,
                );
            }

            const hash = createHash('sha256').update(built.text).digest('hex');
            const forceRestart = body.internals.forceRestart === true;
            const unchanged = hash === this.appliedConfigHash && this.haproxy.isRunning;

            if (unchanged && !forceRestart) {
                this.logger.log('Config unchanged, HAProxy left running.');
            } else {
                const validation = await this.haproxy.validate(built.text);

                if (!validation.ok) {
                    throw new ConfigBuildError(`HAProxy rejected the config: ${validation.error}`);
                }

                await this.haproxy.apply(built.text);

                this.appliedConfigHash = hash;
                this.logger.log(
                    `Applied config with ${built.frontends.length} frontend(s): ${
                        built.frontends.map((f) => f.inboundTag).join(', ') || 'none'
                    }`,
                );
            }

            this.frontends = built.frontends;
            this.lastError = null;

            return {
                isStarted: true,
                version,
                error: null,
                nodeInformation: { version: REPORTED_VERSION },
                system: this.getSystem(),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            this.lastError = message;
            this.logger.error(`Failed to start relay: ${message}`);

            return {
                isStarted: false,
                version,
                error: message,
                nodeInformation: { version: REPORTED_VERSION },
                system: this.getSystem(),
            };
        }
    }

    public async stop(): Promise<{ isStopped: boolean }> {
        await this.integrations.stop();
        this.haproxy.stop();

        this.frontends = [];
        this.appliedConfigHash = null;

        return { isStopped: true };
    }

    public async healthCheck(): Promise<{
        isAlive: boolean;
        xrayInternalStatusCached: boolean;
        xrayVersion: string | null;
        nodeVersion: string;
    }> {
        return {
            isAlive: true,
            xrayInternalStatusCached: this.haproxy.isRunning,
            // Core version: same "-ha" string. HAProxy's own version is logged at startup.
            xrayVersion: REPORTED_VERSION,
            nodeVersion: REPORTED_VERSION,
        };
    }

    public getSystem(): TNodeSystem {
        return {
            info: getSystemInfo(),
            stats: {
                ...getSystemStats(),
                interface: this.networkStats.getInterfaceStats(),
            },
        };
    }

    public getLastError(): string | null {
        return this.lastError;
    }
}
