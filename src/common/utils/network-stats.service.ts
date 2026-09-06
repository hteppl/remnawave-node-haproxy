import { readFileSync } from 'node:fs';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ENV, TEnv } from '../../config/env';
import { TNetworkInterface } from '../../contract/schemas';

interface ICounters {
    rx: number;
    tx: number;
}

/** Reads /proc/net/dev on an interval to turn byte counters into rates. */
@Injectable()
export class NetworkStatsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NetworkStatsService.name);

    private timer: NodeJS.Timeout | null = null;
    private previous: Map<string, ICounters> = new Map();
    private previousAt = 0;
    private rates: Map<string, TNetworkInterface> = new Map();

    constructor(@Inject(ENV) private readonly env: TEnv) {}

    onModuleInit(): void {
        this.sample();

        this.timer = setInterval(() => this.sample(), this.env.NETWORK_POLL_INTERVAL_MS);
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    public getInterfaceStats(): TNetworkInterface | null {
        const name = this.env.NETWORK_INTERFACE ?? this.detectDefaultInterface();

        if (name) {
            const stats = this.rates.get(name);
            if (stats) return stats;
        }

        // Fall back to the busiest non-loopback interface.
        let busiest: TNetworkInterface | null = null;
        for (const stats of this.rates.values()) {
            if (stats.interface === 'lo') continue;
            if (!busiest || stats.rxTotal + stats.txTotal > busiest.rxTotal + busiest.txTotal) {
                busiest = stats;
            }
        }

        return busiest;
    }

    private detectDefaultInterface(): string | null {
        try {
            const routes = readFileSync('/proc/net/route', 'utf-8').split('\n').slice(1);

            for (const line of routes) {
                const [iface, destination, , flags] = line.trim().split(/\s+/);
                // Destination 00000000 with the RTF_UP|RTF_GATEWAY flags is the default route.
                if (destination === '00000000' && (parseInt(flags, 16) & 0x3) === 0x3) {
                    return iface;
                }
            }
        } catch {
            /* not Linux, or /proc unavailable */
        }

        return null;
    }

    private sample(): void {
        let content: string;
        try {
            content = readFileSync('/proc/net/dev', 'utf-8');
        } catch {
            return;
        }

        const now = Date.now();
        const elapsedSec = this.previousAt ? (now - this.previousAt) / 1000 : 0;
        const current = new Map<string, ICounters>();

        for (const line of content.split('\n').slice(2)) {
            const [namePart, valuePart] = line.split(':');
            if (!valuePart) continue;

            const name = namePart.trim();
            const values = valuePart.trim().split(/\s+/).map(Number);
            if (values.length < 9 || Number.isNaN(values[0])) continue;

            const counters: ICounters = { rx: values[0], tx: values[8] };
            current.set(name, counters);

            const prev = this.previous.get(name);
            const rxDelta = prev && counters.rx >= prev.rx ? counters.rx - prev.rx : 0;
            const txDelta = prev && counters.tx >= prev.tx ? counters.tx - prev.tx : 0;

            this.rates.set(name, {
                interface: name,
                rxBytesPerSec: elapsedSec > 0 ? Math.round(rxDelta / elapsedSec) : 0,
                txBytesPerSec: elapsedSec > 0 ? Math.round(txDelta / elapsedSec) : 0,
                rxTotal: counters.rx,
                txTotal: counters.tx,
            });
        }

        this.previous = current;
        this.previousAt = now;
    }
}
