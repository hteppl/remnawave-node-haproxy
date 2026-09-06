import 'reflect-metadata';

import helmet from 'helmet';
import { SecureContext, SecureVersion, createSecureContext } from 'node:tls';

import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppModule } from './app.module';
import { ROOT } from './contract/api';
import { checkPayload, deriveSni, makeSniVerifier, parseNodePayload } from './security/node-payload';
import { jsonBodyParser } from './common/body-parser.middleware';
import { resolveProcessTitle } from './common/utils/process-title';
import { loadEnv } from './config/env';
import { HaproxyProcessService } from './modules/haproxy/haproxy-process.service';
import { NODE_VERSION, REPORTED_VERSION, isBelowPanelMinimum } from './version';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
    process.title = resolveProcessTitle();

    const env = loadEnv();
    const payload = parseNodePayload(env.SECRET_KEY);

    const checks = checkPayload(payload);
    for (const check of checks) {
        const line = `${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? `  ${check.detail}` : ''}`;
        check.ok ? logger.log(line) : logger.error(line);
    }
    if (checks.some((check) => !check.ok)) {
        throw new Error('SECRET_KEY payload validation failed. Double check your SECRET_KEY.');
    }

    // Mutual TLS: the panel presents a client cert signed by the same CA.
    let tlsCertOptions: HttpsOptions;

    if (env.SNI_VERIFICATION) {
        const realCtx: SecureContext = createSecureContext({
            key: payload.nodeKeyPem,
            cert: payload.nodeCertPem,
            ca: [payload.caCertPem],
            minVersion: 'TLSv1.3',
        });

        const verifySni = makeSniVerifier(payload.caCertPem, payload.jwtPublicKey);

        tlsCertOptions = {
            SNICallback: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) =>
                verifySni(servername) ? cb(null, realCtx) : cb(new Error('unknown sni')),
        } as HttpsOptions;
    } else {
        tlsCertOptions = {
            key: payload.nodeKeyPem,
            cert: payload.nodeCertPem,
            ca: [payload.caCertPem],
        };
    }

    const httpsOptions: { minVersion?: SecureVersion } & HttpsOptions = {
        ...tlsCertOptions,
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.3',
        handshakeTimeout: 10_000,
    } as { minVersion?: SecureVersion } & HttpsOptions;

    const app = await NestFactory.create(AppModule.register(env, payload), {
        httpsOptions,
        bodyParser: false,
    });

    app.use(jsonBodyParser());
    app.use(helmet());
    app.setGlobalPrefix(ROOT);
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableShutdownHooks();

    const server = app.getHttpServer();
    server.keepAliveTimeout = 60_000;
    server.headersTimeout = 61_000;

    await app.listen(env.NODE_PORT);

    logger.log(`remnawave-node-haproxy ${NODE_VERSION} listening on :${env.NODE_PORT} as "${process.title}"`);
    logger.log(`Reporting version ${REPORTED_VERSION} to the panel (node and core)`);

    if (isBelowPanelMinimum(REPORTED_VERSION)) {
        logger.warn(
            `Reported version "${REPORTED_VERSION}" is below 2.7.0; the panel will refuse ` +
                'this node with "Outdated version ... (>= 2.7.0)". Bump the package version.',
        );
    }

    const haproxyVersion = await app.get(HaproxyProcessService).getVersion();
    logger.log(
        `HAProxy ${haproxyVersion ?? 'version unknown'} (${env.HAPROXY_BIN}), config: ${env.HAPROXY_CONFIG_PATH}`,
    );
    logger.log(
        env.SNI_VERIFICATION
            ? `SNI verification enabled, expecting: ${deriveSni(payload.caCertPem, payload.jwtPublicKey)}`
            : 'SNI verification disabled',
    );
}

void bootstrap().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
