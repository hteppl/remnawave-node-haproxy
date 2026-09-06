import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readVersion(): string {
    for (const path of [join(__dirname, '..', 'package.json'), join(process.cwd(), 'package.json')]) {
        try {
            return JSON.parse(readFileSync(path, 'utf-8')).version ?? '0.0.0';
        } catch {
            /* try the next candidate */
        }
    }

    return '0.0.0';
}

export const NODE_VERSION = readVersion();

/** Reported to the panel as node *and* core version. The panel rejects below 2.7.0. */
export const REPORTED_VERSION = `${NODE_VERSION}-ha`;

/** Warns rather than fails: only the panel decides what it accepts. */
export function isBelowPanelMinimum(version: string, minimum = [2, 7, 0]): boolean {
    const parts = version
        .split('-')[0]
        .split('.')
        .map((part) => parseInt(part, 10));

    for (let i = 0; i < minimum.length; i++) {
        const value = Number.isFinite(parts[i]) ? parts[i] : 0;

        if (value !== minimum[i]) return value < minimum[i];
    }

    return false;
}
