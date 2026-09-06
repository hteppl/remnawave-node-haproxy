import {
    THaproxyConfig,
    TRelayBackend,
    TRelayFrontend,
    TRelayServer,
} from '../../contract/relay-config.schema';

export interface IFrontendMapping {
    proxyName: string;
    inboundTag: string;
    port: number;
}

export interface IBuiltConfig {
    text: string;
    frontends: IFrontendMapping[];
    warnings: string[];
    /** Frontend tags that belong to a different relay node. */
    skipped: string[];
}

/** Node identity from the start payload. */
export interface INodeIdentity {
    name?: string;
    uuid?: string;
    id?: number;
    tags?: string[];
    countryCode?: string;
}

export interface IBuildOptions {
    runtime: { statsSocket: string; bootstrapSocket: string };
    /** Node identity, for `nodes` scoping. */
    node?: INodeIdentity;
}

export class ConfigBuildError extends Error {}

/** Proxy names accept a limited character set; inbound tags do not. */
function sanitizeName(value: string): string {
    return value.replace(/[^A-Za-z0-9_.:-]/g, '_');
}

/** With `nodes`, a frontend is built only by the relays it names. */
function matchesNode(names: string[] | undefined, node: INodeIdentity | undefined, tag: string): boolean {
    if (!names) return true;

    if (!node) {
        throw new ConfigBuildError(
            `Frontend "${tag}" uses "nodes", but the panel sent no node metadata to match it against. ` +
                'Remove "nodes", or use a panel version that sends node metadata.',
        );
    }

    const identities = [
        node.name,
        node.uuid,
        node.id === undefined ? undefined : String(node.id),
        node.countryCode,
        ...(node.tags ?? []),
    ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.toLowerCase());

    return names.some((name) => identities.includes(name.toLowerCase()));
}

function renderServer(server: TRelayServer, index: number, defaultPort: number, checkIntervalMs?: number): string {
    const name = sanitizeName(server.name ?? `srv${index + 1}`);
    const port = server.port ?? defaultPort;
    const parts = [`    server ${name} ${server.address}:${port}`];

    if (server.sendProxy === 'v1') parts.push('send-proxy');
    if (server.sendProxy === 'v2') parts.push('send-proxy-v2');
    if (server.check) parts.push('check');
    if (server.check && checkIntervalMs) parts.push(`inter ${checkIntervalMs}`);
    if (server.weight !== undefined) parts.push(`weight ${server.weight}`);
    if (server.maxconn !== undefined) parts.push(`maxconn ${server.maxconn}`);
    if (server.backup) parts.push('backup');

    return parts.join(' ');
}

/** Renders the node integration's HAProxy config to an haproxy.cfg. */
export function buildHaproxyConfig(config: THaproxyConfig, options: IBuildOptions): IBuiltConfig {
    const { runtime, node } = options;

    const warnings: string[] = [];
    const skipped: string[] = [];
    const frontends: IFrontendMapping[] = [];

    const backendsByName = new Map<string, TRelayBackend>();
    for (const backend of config.backends) {
        if (backendsByName.has(backend.name)) {
            throw new ConfigBuildError(`Duplicate haproxy backend name: "${backend.name}"`);
        }
        backendsByName.set(backend.name, backend);
    }

    const frontendSections: string[] = [];
    const backendSections: string[] = [];
    const emittedBackends = new Set<string>();
    const usedNames = new Set<string>();
    const usedBinds = new Map<string, string>();

    for (const frontend of config.frontends) {
        if (!frontend.enabled) continue;

        if (!matchesNode(frontend.nodes, node, frontend.tag)) {
            skipped.push(frontend.tag);
            continue;
        }

        if (!frontend.backend && !frontend.servers) {
            throw new ConfigBuildError(
                `Frontend "${frontend.tag}" needs either "backend" or "servers".`,
            );
        }
        if (frontend.backend && frontend.servers) {
            throw new ConfigBuildError(
                `Frontend "${frontend.tag}" has both "backend" and "servers"; pick one.`,
            );
        }

        const port = frontend.port;

        let backend: TRelayBackend;
        if (frontend.backend) {
            const found = backendsByName.get(frontend.backend);
            if (!found) {
                throw new ConfigBuildError(
                    `Frontend "${frontend.tag}" references unknown backend "${frontend.backend}".`,
                );
            }
            backend = found;
        } else {
            backend = {
                name: `inline_${frontend.tag}`,
                balance: 'roundrobin',
                servers: frontend.servers!,
            };
        }

        let proxyName = sanitizeName(frontend.tag);
        if (usedNames.has(proxyName)) {
            let suffix = 2;
            while (usedNames.has(`${proxyName}_${suffix}`)) suffix++;
            proxyName = `${proxyName}_${suffix}`;
        }
        usedNames.add(proxyName);

        const binds = Array.isArray(frontend.bind) ? frontend.bind : [frontend.bind];
        const bindLines = binds.map((address) => {
            const key = `${address}:${port}`;
            const owner = usedBinds.get(key);
            if (owner) {
                throw new ConfigBuildError(
                    `Frontend "${frontend.tag}" binds ${key}, already taken by "${owner}".`,
                );
            }
            usedBinds.set(key, frontend.tag);

            return `    bind ${address}:${port}${frontend.acceptProxy ? ' accept-proxy' : ''}`;
        });

        const backendProxyName = `be_${sanitizeName(backend.name)}`;

        frontendSections.push(
            [
                `frontend fe_${proxyName}`,
                ...bindLines,
                '    mode tcp',
                '    option tcplog',
                ...(frontend.extra ?? []).map((line) => `    ${line}`),
                `    default_backend ${backendProxyName}`,
            ].join('\n'),
        );

        frontends.push({ proxyName: `fe_${proxyName}`, inboundTag: frontend.tag, port });

        if (!emittedBackends.has(backendProxyName)) {
            emittedBackends.add(backendProxyName);

            backendSections.push(
                [
                    `backend ${backendProxyName}`,
                    '    mode tcp',
                    `    balance ${backend.balance}`,
                    ...(backend.retries !== undefined ? [`    retries ${backend.retries}`] : []),
                    ...(backend.extra ?? []).map((line) => `    ${line}`),
                    ...backend.servers.map((server, index) =>
                        renderServer(server, index, port, backend.checkIntervalMs),
                    ),
                ].join('\n'),
            );
        }
    }

    if (frontends.length === 0) {
        // HAProxy refuses to start without a listener.
        warnings.push('No frontend was built; HAProxy is idling on its bootstrap socket.');
        frontendSections.push(
            [
                'frontend fe_bootstrap',
                `    bind unix@${runtime.bootstrapSocket}`,
                '    mode tcp',
            ].join('\n'),
        );
    }

    const { global, defaults } = config;

    // Workers drop to `user` and are confined to `chroot`; the master keeps root to
    // bind privileged ports. Skipped when `extra` sets them.
    const setInExtra = (keyword: string): boolean =>
        (global.extra ?? []).some((line) => line.trim().startsWith(`${keyword} `));
    const hardening = (
        [
            ['user', global.user],
            ['group', global.group],
            ['chroot', global.chroot],
        ] as const
    )
        .filter(([keyword, value]) => value && !setInExtra(keyword))
        .map(([keyword, value]) => `    ${keyword} ${value}`);

    const globalSection = [
        'global',
        `    log stdout format raw local0 ${global.logLevel}`,
        `    maxconn ${global.maxconn}`,
        ...(global.nbthread !== undefined ? [`    nbthread ${global.nbthread}`] : []),
        ...hardening,
        `    stats socket ${runtime.statsSocket} mode 660 level admin expose-fd listeners`,
        '    stats timeout 30s',
        ...(global.extra ?? []).map((line) => `    ${line}`),
    ].join('\n');

    const defaultsSection = [
        'defaults',
        '    log global',
        '    mode tcp',
        '    option dontlognull',
        `    retries ${defaults.retries}`,
        `    timeout connect ${defaults.timeoutConnectMs}ms`,
        `    timeout client ${defaults.timeoutClientMs}ms`,
        `    timeout server ${defaults.timeoutServerMs}ms`,
        `    timeout tunnel ${defaults.timeoutTunnelMs}ms`,
        ...(defaults.extra ?? []).map((line) => `    ${line}`),
    ].join('\n');

    const text = [
        '# Generated by remnawave-node-haproxy. Do not edit: rewritten on every panel sync.',
        globalSection,
        defaultsSection,
        ...frontendSections,
        ...backendSections,
        '',
    ].join('\n\n');

    return { text, frontends, warnings, skipped };
}
