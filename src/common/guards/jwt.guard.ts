import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Drops the socket rather than answering, so a scanner learns nothing. */
export class JwtDefaultGuard extends AuthGuard('registeredUserJWT') {
    private readonly logger = new Logger(JwtDefaultGuard.name);

    handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown, context: ExecutionContext): TUser {
        if (info instanceof Error || err || !user) {
            const request = context.switchToHttp().getRequest();
            const response = context.switchToHttp().getResponse();

            this.logger.error(
                `Incorrect SECRET_KEY or JWT! Request dropped. URL: ${request.url}, IP: ${request.ip}`,
            );

            response.socket?.destroy();
            throw new UnauthorizedException('Unauthorized');
        }

        return user;
    }
}
