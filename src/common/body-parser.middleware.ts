import { NextFunction, Request, Response } from 'express';
import { brotliDecompressSync, gunzipSync, inflateSync, zstdDecompressSync } from 'node:zlib';

const MAX_BODY_BYTES = 512 * 1024 * 1024;

function decompress(buffer: Buffer, encoding: string | undefined): Buffer {
    if (!encoding || buffer.length === 0) return buffer;

    switch (encoding.trim().toLowerCase()) {
        case 'zstd':
            return zstdDecompressSync(buffer);
        case 'gzip':
        case 'x-gzip':
            return gunzipSync(buffer);
        case 'deflate':
            return inflateSync(buffer);
        case 'br':
            return brotliDecompressSync(buffer);
        default:
            return buffer;
    }
}

/** The panel zstd-compresses bulk user syncs, which express.json() would reject. */
export function jsonBodyParser() {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (req.method === 'GET' || req.method === 'HEAD') {
            req.body = {};
            next();
            return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let aborted = false;

        req.on('data', (chunk: Buffer) => {
            if (aborted) return;

            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                aborted = true;
                res.status(413).json({ isOk: false, message: 'Payload too large' });
                req.destroy();
                return;
            }

            chunks.push(chunk);
        });

        req.on('end', () => {
            if (aborted) return;

            try {
                const raw = decompress(Buffer.concat(chunks), req.headers['content-encoding']);

                req.body = raw.length === 0 ? {} : JSON.parse(raw.toString('utf-8'));
                next();
            } catch (error) {
                res.status(400).json({
                    isOk: false,
                    message: `Malformed request body: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                });
            }
        });

        req.on('error', () => {
            if (!aborted) next();
        });
    };
}
