import { X509Certificate, createPublicKey, hkdfSync, timingSafeEqual } from 'node:crypto';

/** SECRET_KEY handling, compatible with remnawave/node so the panel's value works unchanged. */
export interface INodePayload {
    caCertPem: string;
    jwtPublicKey: string;
    nodeCertPem: string;
    nodeKeyPem: string;
}

const HKDF_INFO = 'rw-v1';
const TLDS = ['com', 'net', 'org', 'io', 'dev', 'app'];

function normalizePem(pem: string): string {
    return pem
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/(-----BEGIN [A-Z ]+-----)/g, '$1\n')
        .replace(/(-----END [A-Z ]+-----)/g, '\n$1')
        .replace(/\n+/g, '\n')
        .trim();
}

function isValidNodePayload(payload: unknown): payload is INodePayload {
    if (!payload || typeof payload !== 'object') return false;

    return (
        'caCertPem' in payload &&
        typeof payload.caCertPem === 'string' &&
        'jwtPublicKey' in payload &&
        typeof payload.jwtPublicKey === 'string' &&
        'nodeCertPem' in payload &&
        typeof payload.nodeCertPem === 'string' &&
        'nodeKeyPem' in payload &&
        typeof payload.nodeKeyPem === 'string'
    );
}

export function parseNodePayload(secretKey: string): INodePayload {
    if (!secretKey) {
        throw new Error('SECRET_KEY missing in environment variables.');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(secretKey, 'base64').toString('utf-8'));
    } catch {
        throw new Error('SECRET_KEY contains invalid JSON.');
    }

    if (!isValidNodePayload(parsed)) {
        throw new Error('Invalid SECRET_KEY payload structure.');
    }

    return {
        caCertPem: normalizePem(parsed.caCertPem),
        jwtPublicKey: normalizePem(parsed.jwtPublicKey),
        nodeCertPem: normalizePem(parsed.nodeCertPem),
        nodeKeyPem: normalizePem(parsed.nodeKeyPem),
    };
}

/** The SNI the panel sends, derived from the CA cert and JWT public key. */
export function deriveSni(caCertPem: string, jwtPublicKey: string): string {
    const canon = (pem: string) =>
        pem.replace(/-----[^-]+-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');

    const ikm = Buffer.concat([
        Buffer.from(canon(jwtPublicKey), 'utf8'),
        Buffer.from(canon(caCertPem), 'utf8'),
    ]);

    const okm = Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), HKDF_INFO, 22));
    const host = okm.subarray(0, 16).toString('hex');

    return `${host}.${okm.subarray(16, 21).toString('hex')}.${TLDS[okm[21] % TLDS.length]}`;
}

export function makeSniVerifier(
    caCertPem: string,
    jwtPublicKey: string,
): (servername: string) => boolean {
    const expected = Buffer.from(deriveSni(caCertPem, jwtPublicKey));

    return (servername: string): boolean => {
        if (!servername) return false;

        const got = Buffer.from(servername);
        if (got.length !== expected.length) return false;

        return timingSafeEqual(got, expected);
    };
}

export interface IPayloadCheck {
    name: string;
    ok: boolean;
    detail: string;
}

/** Fails fast on a malformed SECRET_KEY, not on the first panel request. */
export function checkPayload(p: INodePayload): IPayloadCheck[] {
    const checks: IPayloadCheck[] = [];
    const add = (name: string, fn: () => string | undefined): void => {
        try {
            checks.push({ name, ok: true, detail: fn() ?? '' });
        } catch (e) {
            checks.push({
                name,
                ok: false,
                detail: e instanceof Error ? e.message.split('\n')[0] : String(e),
            });
        }
    };

    let ca: X509Certificate | undefined;
    let node: X509Certificate | undefined;

    add('CA parses', () => {
        ca = new X509Certificate(p.caCertPem);
        return ca.fingerprint256.slice(0, 24);
    });
    add('CA not expired', () => {
        if (!ca) throw new Error('CA unavailable');
        const now = new Date();
        if (new Date(ca.validFrom) > now) throw new Error('not yet valid');
        if (new Date(ca.validTo) < now) throw new Error('expired');
        return `until ${ca.validTo}`;
    });
    add('node cert parses', () => {
        node = new X509Certificate(p.nodeCertPem);
        return node.fingerprint256.slice(0, 24);
    });
    add('node signed by CA', () => {
        if (!ca || !node) throw new Error('cert unavailable');
        if (!node.verify(ca.publicKey)) throw new Error('not signed by this CA');
        return 'valid';
    });
    add('node key matches cert', () => {
        if (!node) throw new Error('cert unavailable');
        const certPub = node.publicKey.export({ type: 'spki', format: 'der' });
        const keyPub = createPublicKey(p.nodeKeyPem).export({ type: 'spki', format: 'der' });
        if (!Buffer.from(certPub).equals(Buffer.from(keyPub))) {
            throw new Error('key does not match cert');
        }
        return 'valid';
    });
    add('jwt public key', () => {
        createPublicKey(p.jwtPublicKey);
        return 'ok';
    });

    return checks;
}
