import { readFileSync, readdirSync } from 'node:fs';

const CANDIDATES = ['nginx', 'caddy', 'traefik', 'envoy', 'httpd', 'lighttpd'] as const;
const FALLBACK = 'node-haproxy';

/** Process names we can see (own PID namespace, or the host under --pid=host). */
function runningProcessNames(): Set<string> {
    const names = new Set<string>();

    let pids: string[];
    try {
        pids = readdirSync('/proc');
    } catch {
        return names;
    }

    for (const pid of pids) {
        if (!/^\d+$/.test(pid)) continue;

        try {
            names.add(readFileSync(`/proc/${pid}/comm`, 'utf-8').trim());
        } catch {
            // Process gone between readdir and read, or not readable.
        }
    }

    return names;
}

/**
 * Disguise for `process.title`: PROCESS_TITLE forces a name,
 * PROCESS_TITLE_DISGUISE=false keeps the honest one; otherwise the first
 * candidate not already running, or the fallback if all are taken.
 */
export function resolveProcessTitle(env: NodeJS.ProcessEnv = process.env): string {
    if (env.PROCESS_TITLE) return env.PROCESS_TITLE;
    if (env.PROCESS_TITLE_DISGUISE === 'false') return FALLBACK;

    const running = runningProcessNames();
    return CANDIDATES.find((name) => !running.has(name)) ?? FALLBACK;
}
