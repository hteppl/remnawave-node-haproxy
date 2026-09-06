import { createConnection } from 'node:net';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, TEnv } from '../../config/env';

export interface IProxyCounters {
    /** From clients. */
    bin: number;
    /** To clients. */
    bout: number;
    /** Sessions open right now. */
    scur: number;
}

const CLI_TIMEOUT_MS = 5000;

/** HAProxy runtime API over the admin unix socket. */
@Injectable()
export class HaproxyCliService {
    private readonly logger = new Logger(HaproxyCliService.name);

    constructor(@Inject(ENV) private readonly env: TEnv) {}

    public get statsSocketPath(): string {
        return `${this.env.HAPROXY_RUNTIME_DIR}/admin.sock`;
    }

    public async command(command: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const socket = createConnection({ path: this.statsSocketPath });
            const chunks: Buffer[] = [];
            let settled = false;

            const finish = (error: Error | null, output?: string): void => {
                if (settled) return;
                settled = true;

                socket.destroy();
                error ? reject(error) : resolve(output ?? '');
            };

            socket.setTimeout(CLI_TIMEOUT_MS);
            socket.on('connect', () => socket.write(`${command}\n`));
            socket.on('data', (chunk: Buffer) => chunks.push(chunk));
            socket.on('end', () => finish(null, Buffer.concat(chunks).toString('utf-8')));
            socket.on('timeout', () => finish(new Error('HAProxy CLI timed out')));
            socket.on('error', (error) => finish(error));
        });
    }

    /** `show info` as key/value pairs, e.g. Uptime_sec, Tasks, PoolAlloc_MB. */
    public async getInfo(): Promise<Map<string, string>> {
        const result = new Map<string, string>();

        let raw: string;
        try {
            raw = await this.command('show info');
        } catch {
            return result;
        }

        for (const line of raw.split('\n')) {
            const separator = line.indexOf(':');
            if (separator === -1) continue;

            result.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
        }

        return result;
    }

    /**
     * Entry counts from every stick-table, keyed by the proxy that owns it. Asking
     * without a table name returns one header line each, so the reply stays small
     * no matter how many clients are tracked.
     */
    public async getStickTableEntries(): Promise<Map<string, number>> {
        const result = new Map<string, number>();

        let raw: string;
        try {
            raw = await this.command('show table');
        } catch (error) {
            this.logger.warn(
                `Could not read HAProxy stick-tables: ${error instanceof Error ? error.message : error}`,
            );
            return result;
        }

        for (const line of raw.split('\n')) {
            const match = line.match(/^#\s*table:\s*([^,]+),.*\bused:\s*(\d+)/);
            if (match) result.set(match[1].trim(), Number(match[2]));
        }

        return result;
    }

    /** Counters from each proxy's FRONTEND row, keyed by proxy name. */
    public async getFrontendCounters(): Promise<Map<string, IProxyCounters>> {
        const result = new Map<string, IProxyCounters>();

        let raw: string;
        try {
            // "-1 1 -1" asks for frontend rows only, skipping every backend and server.
            raw = await this.command('show stat -1 1 -1');
            if (!raw.startsWith('#')) raw = await this.command('show stat');
        } catch (error) {
            this.logger.warn(
                `Could not read HAProxy stats: ${error instanceof Error ? error.message : error}`,
            );
            return result;
        }

        const lines = raw.split('\n');
        // Column order is not part of HAProxy's contract, so resolve it once by name.
        const header = lines[0].replace(/^#\s*/, '').split(',');
        const px = header.indexOf('pxname');
        const sv = header.indexOf('svname');
        const bin = header.indexOf('bin');
        const bout = header.indexOf('bout');
        const scur = header.indexOf('scur');

        for (const line of lines) {
            if (!line || line.startsWith('#')) continue;

            const columns = line.split(',');
            if (columns[sv] !== 'FRONTEND') continue;

            result.set(columns[px], {
                bin: Number(columns[bin]) || 0,
                bout: Number(columns[bout]) || 0,
                scur: Number(columns[scur]) || 0,
            });
        }

        return result;
    }
}
