import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, TEnv } from '../../config/env';
import { NetworkStatsService } from '../../common/utils/network-stats.service';
import { getSystemStats } from '../../common/utils/system-stats';
import { HaproxyCliService } from '../haproxy/haproxy-cli.service';
import { ONLINE_TABLE } from '../haproxy/haproxy-config.builder';
import { RelayService } from '../relay/relay.service';
import { TrafficTracker } from './traffic-tracker';

export interface IProxyStats {
    tag: string;
    uplink: number;
    downlink: number;
}

@Injectable()
export class StatsService {
    private readonly logger = new Logger(StatsService.name);
    private readonly tracker = new TrafficTracker();

    /** Far above any real user id, so a session row never touches a real account. */
    private static readonly SYNTHETIC_ID_BASE = 1_000_000_000_000;

    private warnedAboutMissingTable = false;

    constructor(
        private readonly haproxyCli: HaproxyCliService,
        private readonly relayService: RelayService,
        private readonly networkStats: NetworkStatsService,
        @Inject(ENV) private readonly env: TEnv,
    ) {}

    public async getAllInboundsStats(reset: boolean): Promise<IProxyStats[]> {
        await this.refresh();

        return this.relayService.getFrontends().map((frontend) => ({
            tag: frontend.inboundTag,
            ...this.tracker.read(frontend.proxyName, reset),
        }));
    }

    public async getInboundStats(tag: string, reset: boolean): Promise<IProxyStats> {
        await this.refresh();

        const frontend = this.relayService.getFrontends().find((f) => f.inboundTag === tag);

        if (!frontend) {
            return { tag, uplink: 0, downlink: 0 };
        }

        return { tag, ...this.tracker.read(frontend.proxyName, reset) };
    }

    /**
     * "Users online" = rows the panel counts here, but only those with a numeric
     * (BigInt) username. A relay has no real ids, so it emits one zero-byte row
     * per counted client under a synthetic id (see SYNTHETIC_ID_BASE). Off -> 0.
     */
    public async getUsersStats(): Promise<Array<{ username: string; uplink: number; downlink: number }>> {
        if (!this.env.REPORT_SESSIONS_AS_ONLINE) return [];

        const online = await this.countOnline();

        return Array.from({ length: online }, (_, index) => ({
            username: String(StatsService.SYNTHETIC_ID_BASE + index),
            uplink: 0,
            downlink: 0,
        }));
    }

    /**
     * TLS is opaque to a relay, so a client can only be counted by its address.
     * One client opens several connections at once, which is why `sessions`
     * overcounts by roughly the number of streams a client keeps open.
     */
    private async countOnline(): Promise<number> {
        if (this.env.ONLINE_SOURCE === 'ips') {
            const entries = (await this.haproxyCli.getStickTableEntries()).get(ONLINE_TABLE);

            // Every frontend shares one table, so a client on two ports counts once.
            if (entries !== undefined) {
                this.warnedAboutMissingTable = false;
                return entries;
            }

            // A config built before this table existed is still running; the next
            // panel sync replaces it. Warn once instead of on every poll.
            if (!this.warnedAboutMissingTable) {
                this.warnedAboutMissingTable = true;
                this.logger.warn(
                    `ONLINE_SOURCE=ips, but HAProxy has no "${ONLINE_TABLE}" table; counting sessions until the next config sync.`,
                );
            }
        }

        const counters = await this.haproxyCli.getFrontendCounters();

        return this.relayService
            .getFrontends()
            .reduce((total, frontend) => total + (counters.get(frontend.proxyName)?.scur ?? 0), 0);
    }

    /** A relay has no outbounds; empty keeps the panel from counting egress twice. */
    public getAllOutboundsStats(): IProxyStats[] {
        return [];
    }

    public getOutboundStats(tag: string): IProxyStats {
        return { tag, uplink: 0, downlink: 0 };
    }

    /**
     * A null `xrayInfo` disconnects the node ("Required info is missing"), and the
     * panel shows its `uptime`. Filled from `show info`; Go GC counters stay zero.
     */
    public async getSystemStats() {
        const info = await this.haproxyCli.getInfo();
        const num = (key: string): number => {
            const value = Number(info.get(key));
            return Number.isFinite(value) ? value : 0;
        };
        const megabytes = (key: string): number => num(key) * 1024 * 1024;

        return {
            xrayInfo: {
                numGoroutine: num('Tasks'),
                numGC: 0,
                alloc: megabytes('PoolUsed_MB'),
                totalAlloc: 0,
                sys: megabytes('PoolAlloc_MB'),
                mallocs: 0,
                frees: 0,
                liveObjects: 0,
                pauseTotalNs: 0,
                uptime: num('Uptime_sec'),
            },
            plugins: {
                torrentBlocker: {
                    reportsCount: 0,
                },
            },
            system: {
                stats: {
                    ...getSystemStats(),
                    interface: this.networkStats.getInterfaceStats(),
                },
            },
        };
    }

    private async refresh(): Promise<void> {
        const counters = await this.haproxyCli.getFrontendCounters();

        for (const [proxyName, { bin, bout }] of counters) {
            this.tracker.update(proxyName, bin, bout);
        }
    }
}
