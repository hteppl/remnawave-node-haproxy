import { Request, Response } from 'express';

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

/** Keeps error bodies in the shape the panel's client expects. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status = exception instanceof HttpException ? exception.getStatus() : 500;
        const message = exception instanceof Error ? exception.message : 'Internal server error';

        if (status >= 500) {
            this.logger.error(`${request.method} ${request.url} -> ${status}: ${message}`);
        }

        if (response.headersSent) return;

        response.status(status).json({
            isOk: false,
            message,
            errorCode: status,
        });
    }
}
