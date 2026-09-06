/** Geo-check probes an xray outbound; a relay has none, so answer with a placeholder. */
const PLACEHOLDER_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="40">',
    '<rect width="320" height="40" rx="6" fill="#2b2b2b"/>',
    '<text x="16" y="25" fill="#d0d0d0" font-family="monospace" font-size="13">',
    'geo check unavailable on HAProxy relay',
    '</text></svg>',
].join('');

export function getGeocheckStub() {
    return {
        image: {
            format: 'svg' as const,
            media_type: 'image/svg+xml' as const,
            encoding: 'base64' as const,
            data: Buffer.from(PLACEHOLDER_SVG, 'utf-8').toString('base64'),
        },
    };
}
