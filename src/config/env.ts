import { z } from 'zod';

const booleanString = (def: 'true' | 'false' = 'false') =>
    z
        .string()
        .default(def)
        .transform((val) => (val === '' ? def : val))
        .refine((val) => val === 'true' || val === 'false', 'Must be "true" or "false".')
        .transform((val) => val === 'true');

export const envSchema = z.object({
    NODE_PORT: z
        .string()
        .default('2222')
        .transform((port) => parseInt(port, 10)),
    SECRET_KEY: z.string().min(1),
    SNI_VERIFICATION: booleanString('false'),

    HAPROXY_BIN: z.string().default('/usr/sbin/haproxy'),
    HAPROXY_CONFIG_PATH: z.string().default('/etc/haproxy/haproxy.cfg'),
    HAPROXY_RUNTIME_DIR: z.string().default('/var/run/haproxy'),

    /** Report live sessions as "users online"; zero-traffic rows, nothing billed. */
    REPORT_SESSIONS_AS_ONLINE: booleanString('true'),

    /**
     * What one "user online" counts. `ips` counts distinct client addresses from
     * the frontend stick-table; `sessions` counts open TCP connections, which a
     * single client multiplies several times over.
     */
    ONLINE_SOURCE: z.enum(['ips', 'sessions']).default('ips'),

    /** Auto-detected when unset. */
    NETWORK_INTERFACE: z.string().optional(),
    NETWORK_POLL_INTERVAL_MS: z
        .string()
        .default('3000')
        .transform((v) => parseInt(v, 10)),
});

export type TEnv = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');
export const NODE_PAYLOAD = Symbol('NODE_PAYLOAD');

export function loadEnv(): TEnv {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${issues}`);
    }

    return parsed.data;
}
