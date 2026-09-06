import { z } from 'zod';

/**
 * Shapes mirrored from remnawave/node `libs/contract/commands`. Requests tolerate
 * unknown keys so a newer panel cannot break a route by adding a field.
 */

export const NodeMetadataSchema = z.object({
    name: z.string(),
    uuid: z.string(),
    id: z.number(),
    tags: z.array(z.string()),
    countryCode: z.string(),
});

export const NetworkInterfaceSchema = z.object({
    interface: z.string(),
    rxBytesPerSec: z.number(),
    txBytesPerSec: z.number(),
    rxTotal: z.number(),
    txTotal: z.number(),
});

export const NodeSystemInfoSchema = z.object({
    arch: z.string(),
    cpus: z.number().int(),
    cpuModel: z.string(),
    memoryTotal: z.number(),
    hostname: z.string(),
    platform: z.string(),
    release: z.string(),
    type: z.string(),
    version: z.string(),
    networkInterfaces: z.array(z.string()),
});

export const NodeSystemStatsSchema = z.object({
    memoryFree: z.number(),
    memoryUsed: z.number(),
    uptime: z.number(),
    loadAvg: z.array(z.number()),
    interface: z.nullable(NetworkInterfaceSchema),
});

export const NodeSystemSchema = z.object({
    info: NodeSystemInfoSchema,
    stats: NodeSystemStatsSchema,
});

export type TNetworkInterface = z.infer<typeof NetworkInterfaceSchema>;
export type TNodeSystemStats = z.infer<typeof NodeSystemStatsSchema>;
export type TNodeSystem = z.infer<typeof NodeSystemSchema>;

/** POST /node/xray/start */
export const StartRequestSchema = z.looseObject({
    internals: z.looseObject({
        metadata: NodeMetadataSchema.optional(),
        integrations: z.record(z.string(), z.unknown()).optional(),
        forceRestart: z.boolean().default(false),
        hashes: z
            .looseObject({
                emptyConfig: z.string(),
                inbounds: z.array(
                    z.looseObject({
                        usersCount: z.number(),
                        hash: z.string(),
                        tag: z.string(),
                    }),
                ),
            })
            .optional(),
    }),
    /** Sent by the panel, ignored here. */
    xrayConfig: z.record(z.string(), z.unknown()).optional(),
});
export type TStartRequest = z.infer<typeof StartRequestSchema>;

/** POST /node/stats/get-users-stats, get-all-inbounds-stats, ... */
export const ResetRequestSchema = z.looseObject({ reset: z.boolean().default(false) });

/** POST /node/stats/get-inbound-stats, get-outbound-stats */
export const TagResetRequestSchema = z.looseObject({
    tag: z.string(),
    reset: z.boolean().default(false),
});

/** POST /node/stats/get-user-online-status */
export const UsernameRequestSchema = z.looseObject({ username: z.string() });

/** POST /node/stats/get-user-ip-list */
export const UserIdRequestSchema = z.looseObject({ userId: z.string() });

/** POST /node/stats/get-geocheck */
export const GeocheckRequestSchema = z.looseObject({
    ip: z.string().optional(),
    interface: z.string().optional(),
});
