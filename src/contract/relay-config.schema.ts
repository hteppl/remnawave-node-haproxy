import { z } from 'zod';

/** The whole HAProxy config, carried by a node integration under a `haproxy` key. */

const PROXY_PROTOCOL = z.enum(['none', 'v1', 'v2']);

export const RelayServerSchema = z.object({
    name: z.string().optional(),
    address: z.string().min(1),
    /** Defaults to the frontend's port. */
    port: z.number().int().min(1).max(65535).optional(),
    /** Lets the origin see real client IPs. */
    sendProxy: PROXY_PROTOCOL.default('none'),
    check: z.boolean().default(true),
    weight: z.number().int().min(0).max(256).optional(),
    maxconn: z.number().int().min(1).optional(),
    backup: z.boolean().default(false),
});
export type TRelayServer = z.infer<typeof RelayServerSchema>;

export const RelayBackendSchema = z.object({
    name: z.string().min(1),
    balance: z.enum(['roundrobin', 'leastconn', 'source', 'first', 'random']).default('roundrobin'),
    servers: z.array(RelayServerSchema).min(1),
    retries: z.number().int().min(0).max(10).optional(),
    checkIntervalMs: z.number().int().min(100).optional(),
    /** Raw HAProxy lines. */
    extra: z.array(z.string()).optional(),
});
export type TRelayBackend = z.infer<typeof RelayBackendSchema>;

export const RelayFrontendSchema = z.object({
    /** Must match a panel inbound tag, or its traffic is reported against nothing. */
    tag: z.string().min(1),
    /** Exactly one of `backend` (by name) or `servers` (inline). */
    backend: z.string().min(1).optional(),
    servers: z.array(RelayServerSchema).min(1).optional(),
    bind: z.union([z.string(), z.array(z.string())]).default('0.0.0.0'),
    port: z.number().int().min(1).max(65535),
    /** PROXY protocol from a load balancer in front of this relay. */
    acceptProxy: z.boolean().default(false),
    enabled: z.boolean().default(true),
    /** Scopes this frontend to relays matching the node's name, uuid, id, country code or tags. */
    nodes: z.array(z.string().min(1)).min(1).optional(),
    /** Raw HAProxy lines. */
    extra: z.array(z.string()).optional(),
});
export type TRelayFrontend = z.infer<typeof RelayFrontendSchema>;

export const HaproxyGlobalSchema = z.object({
    maxconn: z.number().int().min(1).default(20000),
    nbthread: z.number().int().min(1).max(64).optional(),
    /** `null` drops the directive. */
    user: z.string().nullable().default('haproxy'),
    group: z.string().nullable().default('haproxy'),
    chroot: z.string().nullable().default('/var/lib/haproxy'),
    logLevel: z
        .enum(['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'])
        .default('info'),
    /** Raw HAProxy lines. */
    extra: z.array(z.string()).optional(),
});

export const HaproxyDefaultsSchema = z.object({
    /**
     * One log line per connection, at `global.logLevel`. A busy relay makes a lot
     * of them, so turn this off to keep only process-level messages (config
     * errors, servers going up and down), which are logged either way.
     */
    logConnections: z.boolean().default(true),
    timeoutConnectMs: z.number().int().min(100).default(5000),
    timeoutClientMs: z.number().int().min(1000).default(300000),
    timeoutServerMs: z.number().int().min(1000).default(300000),
    timeoutTunnelMs: z.number().int().min(1000).default(3600000),
    retries: z.number().int().min(0).max(10).default(3),
    /** Raw HAProxy lines. */
    extra: z.array(z.string()).optional(),
});

export const HaproxyConfigSchema = z.object({
    global: HaproxyGlobalSchema.prefault({}),
    defaults: HaproxyDefaultsSchema.prefault({}),
    frontends: z.array(RelayFrontendSchema).default([]),
    backends: z.array(RelayBackendSchema).default([]),
});
export type THaproxyConfig = z.infer<typeof HaproxyConfigSchema>;

export const HAPROXY_CONFIG_SECTIONS = ['global', 'defaults', 'frontends', 'backends'] as const;
