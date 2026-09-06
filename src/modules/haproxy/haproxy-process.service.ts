import { ChildProcess, execFile, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

import { ENV, TEnv } from '../../config/env';

const execFileAsync = promisify(execFile);

/** Keeps HAProxy alive before the panel sends a config with real frontends. */
export const BOOTSTRAP_FRONTEND = (socketPath: string): string =>
    ['frontend fe_bootstrap', `    bind unix@${socketPath}`, '    mode tcp'].join('\n');

@Injectable()
export class HaproxyProcessService implements OnApplicationShutdown {
    private readonly logger = new Logger(HaproxyProcessService.name);

    private process: ChildProcess | null = null;
    private version: string | null = null;
    private stopping = false;

    constructor(@Inject(ENV) private readonly env: TEnv) {}

    public get isRunning(): boolean {
        return this.process !== null && this.process.exitCode === null && !this.process.killed;
    }

    public get masterSocketPath(): string {
        return `${this.env.HAPROXY_RUNTIME_DIR}/master.sock`;
    }

    public get bootstrapSocketPath(): string {
        return `${this.env.HAPROXY_RUNTIME_DIR}/bootstrap.sock`;
    }

    public async getVersion(): Promise<string | null> {
        if (this.version) return this.version;

        try {
            const { stdout } = await execFileAsync(this.env.HAPROXY_BIN, ['-v']);
            // "HAProxy version 3.0.5-1 2024/09/26 - https://haproxy.org/"
            const match = stdout.match(/version\s+([^\s]+)/i);

            this.version = match ? match[1] : stdout.split('\n')[0].trim();
        } catch (error) {
            this.logger.error(
                `Could not read HAProxy version: ${error instanceof Error ? error.message : error}`,
            );
            this.version = null;
        }

        return this.version;
    }

    /** Rejects a bad config before it can take down the running one. */
    public async validate(configText: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const candidatePath = `${this.env.HAPROXY_RUNTIME_DIR}/candidate.cfg`;

        try {
            this.ensureRuntimeDir();
            writeFileSync(candidatePath, configText, 'utf-8');

            await execFileAsync(this.env.HAPROXY_BIN, ['-c', '-f', candidatePath]);

            return { ok: true };
        } catch (error) {
            const stderr = (error as { stderr?: string }).stderr ?? '';

            // Drop the version banner and env warnings; the panel needs the cause.
            const alerts = stderr
                .split('\n')
                .filter((line) => line.includes('[ALERT]'))
                .map((line) => line.replace(/^\[ALERT\]\s*\(\d+\)\s*:\s*/, '').trim())
                .join('; ');

            const message =
                alerts || stderr.trim() || (error instanceof Error ? error.message : String(error));

            return { ok: false, error: message };
        }
    }

    /** Writes the config and starts or seamlessly reloads HAProxy. */
    public async apply(configText: string): Promise<void> {
        this.ensureRuntimeDir();
        mkdirSync(dirname(this.env.HAPROXY_CONFIG_PATH), { recursive: true });
        writeFileSync(this.env.HAPROXY_CONFIG_PATH, configText, 'utf-8');

        if (this.isRunning) {
            this.reload();
            return;
        }

        this.start();
    }

    public currentConfigText(): string | null {
        try {
            return readFileSync(this.env.HAPROXY_CONFIG_PATH, 'utf-8');
        } catch {
            return null;
        }
    }

    public start(): void {
        if (this.isRunning) return;

        this.ensureRuntimeDir();
        this.stopping = false;

        // Master-worker (-W) in foreground (-db): seamless reloads, lifetime tied to us.
        this.process = spawn(
            this.env.HAPROXY_BIN,
            ['-W', '-db', '-S', this.masterSocketPath, '-f', this.env.HAPROXY_CONFIG_PATH],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );

        this.process.stdout?.on('data', (chunk: Buffer) => this.logOutput(chunk));
        this.process.stderr?.on('data', (chunk: Buffer) => this.logOutput(chunk));

        this.process.on('exit', (code, signal) => {
            const wasStopping = this.stopping;
            this.process = null;

            if (wasStopping) {
                this.logger.log('HAProxy stopped.');
                return;
            }

            this.logger.error(`HAProxy exited unexpectedly (code=${code}, signal=${signal}).`);
        });

        this.logger.log(`HAProxy started (pid=${this.process.pid}).`);
    }

    /** SIGUSR2: the master re-reads the config and hands listeners over. */
    public reload(): void {
        if (!this.isRunning || !this.process?.pid) {
            this.start();
            return;
        }

        process.kill(this.process.pid, 'SIGUSR2');
        this.logger.log('HAProxy reload signalled.');
    }

    public stop(): void {
        if (!this.isRunning || !this.process?.pid) return;

        this.stopping = true;
        process.kill(this.process.pid, 'SIGTERM');
    }

    public onApplicationShutdown(): void {
        this.stop();
    }

    private ensureRuntimeDir(): void {
        mkdirSync(this.env.HAPROXY_RUNTIME_DIR, { recursive: true });
    }

    private logOutput(chunk: Buffer): void {
        const text = chunk.toString('utf-8').trim();
        if (!text) return;

        for (const line of text.split('\n')) {
            if (/\[ALERT\]|\[EMERG\]/.test(line)) this.logger.error(line);
            else if (/\[WARNING\]/.test(line)) this.logger.warn(line);
            else this.logger.log(line);
        }
    }
}
