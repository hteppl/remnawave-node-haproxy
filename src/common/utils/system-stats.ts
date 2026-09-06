import * as os from 'node:os';
import { readFileSync } from 'node:fs';

import { TNodeSystemStats } from '../../contract/schemas';

/** MemAvailable is what "free" really means on Linux; os.freemem() is not. */
function readMemAvailable(): number | null {
    try {
        const meminfo = readFileSync('/proc/meminfo', 'utf-8');
        const match = meminfo.match(/^MemAvailable:\s+(\d+) kB$/m);

        return match ? parseInt(match[1], 10) * 1024 : null;
    } catch {
        return null;
    }
}

export function getSystemInfo() {
    const cpus = os.cpus();

    return {
        arch: os.arch(),
        cpus: cpus.length,
        cpuModel: cpus[0]?.model ?? 'unknown',
        memoryTotal: os.totalmem(),
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        type: os.type(),
        version: os.version(),
        networkInterfaces: Object.keys(os.networkInterfaces()),
    };
}

export function getSystemStats(): Omit<TNodeSystemStats, 'interface'> {
    const total = os.totalmem();
    const free = readMemAvailable() ?? os.freemem();

    return {
        memoryFree: free,
        memoryUsed: total - free,
        uptime: os.uptime(),
        loadAvg: os.loadavg(),
    };
}
