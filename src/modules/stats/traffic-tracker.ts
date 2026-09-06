export interface ITrafficCounters {
    uplink: number;
    downlink: number;
}

interface ITrackedProxy {
    lastRawIn: number;
    lastRawOut: number;
    totalIn: number;
    totalOut: number;
    baselineIn: number;
    baselineOut: number;
}

/**
 * HAProxy counters restart on reload, but the panel expects xray's "since last
 * reset" semantics: keep a monotonic total plus a baseline `reset: true` advances.
 */
export class TrafficTracker {
    private proxies = new Map<string, ITrackedProxy>();

    public update(proxyName: string, rawIn: number, rawOut: number): void {
        const tracked = this.proxies.get(proxyName);

        if (!tracked) {
            this.proxies.set(proxyName, {
                lastRawIn: rawIn,
                lastRawOut: rawOut,
                totalIn: rawIn,
                totalOut: rawOut,
                baselineIn: 0,
                baselineOut: 0,
            });
            return;
        }

        // A drop means the counters restarted; the new value is the delta.
        tracked.totalIn += rawIn >= tracked.lastRawIn ? rawIn - tracked.lastRawIn : rawIn;
        tracked.totalOut += rawOut >= tracked.lastRawOut ? rawOut - tracked.lastRawOut : rawOut;
        tracked.lastRawIn = rawIn;
        tracked.lastRawOut = rawOut;
    }

    public read(proxyName: string, reset: boolean): ITrafficCounters {
        const tracked = this.proxies.get(proxyName);
        if (!tracked) return { uplink: 0, downlink: 0 };

        const counters: ITrafficCounters = {
            uplink: Math.max(0, tracked.totalIn - tracked.baselineIn),
            downlink: Math.max(0, tracked.totalOut - tracked.baselineOut),
        };

        if (reset) {
            tracked.baselineIn = tracked.totalIn;
            tracked.baselineOut = tracked.totalOut;
        }

        return counters;
    }

    public forget(proxyNames: Set<string>): void {
        for (const name of this.proxies.keys()) {
            if (!proxyNames.has(name)) this.proxies.delete(name);
        }
    }
}
