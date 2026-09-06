import { ExtractJwt, Strategy } from 'passport-jwt';

import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { INodePayload } from '../../security/node-payload';
import { NODE_PAYLOAD } from '../../config/env';

/** The panel signs every request with the key whose public half is in SECRET_KEY. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'registeredUserJWT') {
    constructor(@Inject(NODE_PAYLOAD) payload: INodePayload) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: payload.jwtPublicKey,
            algorithms: ['RS256'],
        });
    }

    async validate(jwtPayload: unknown): Promise<unknown> {
        return jwtPayload ?? {};
    }
}
