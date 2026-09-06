/** Routes mirrored from remnawave/node `libs/contract/api`; these strings must not drift. */
export const ROOT = '/node' as const;

export const XRAY_CONTROLLER = 'xray' as const;
export const STATS_CONTROLLER = 'stats' as const;
export const HANDLER_CONTROLLER = 'handler' as const;
export const PLUGIN_CONTROLLER = 'plugin' as const;

export const XRAY_ROUTES = {
    START: 'start',
    STOP: 'stop',
    NODE_HEALTH_CHECK: 'healthcheck',
} as const;

export const STATS_ROUTES = {
    GET_USER_ONLINE_STATUS: 'get-user-online-status',
    GET_USERS_STATS: 'get-users-stats',
    GET_SYSTEM_STATS: 'get-system-stats',
    GET_INBOUND_STATS: 'get-inbound-stats',
    GET_OUTBOUND_STATS: 'get-outbound-stats',
    GET_ALL_OUTBOUNDS_STATS: 'get-all-outbounds-stats',
    GET_ALL_INBOUNDS_STATS: 'get-all-inbounds-stats',
    GET_COMBINED_STATS: 'get-combined-stats',
    GET_USER_IP_LIST: 'get-user-ip-list',
    GET_USERS_IP_LIST: 'get-users-ip-list',
    GET_GEOCHECK: 'get-geocheck',
} as const;

export const HANDLER_ROUTES = {
    REMOVE_USER: 'remove-user',
    ADD_USER: 'add-user',
    ADD_USERS: 'add-users',
    REMOVE_USERS: 'remove-users',
    DROP_USERS_CONNECTIONS: 'drop-users-connections',
    DROP_IPS: 'drop-ips',
} as const;

export const TORRENT_BLOCKER_ROUTE = 'torrent-blocker' as const;
export const NFTABLES_ROUTE = 'nftables' as const;

export const PLUGIN_ROUTES = {
    SYNC: 'sync',
    TORRENT_BLOCKER: {
        COLLECT: `${TORRENT_BLOCKER_ROUTE}/collect`,
    },
    NFTABLES: {
        UNBLOCK_IPS: `${NFTABLES_ROUTE}/unblock-ips`,
        BLOCK_IPS: `${NFTABLES_ROUTE}/block-ips`,
        RECREATE_TABLES: `${NFTABLES_ROUTE}/recreate-tables`,
    },
} as const;
