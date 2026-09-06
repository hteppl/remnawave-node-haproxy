import { Controller, Post, UseFilters, UseGuards } from '@nestjs/common';

import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { JwtDefaultGuard } from '../../common/guards/jwt.guard';
import { HANDLER_CONTROLLER, HANDLER_ROUTES } from '../../contract/api';

/**
 * The origin node owns the user list. These acknowledge the panel's syncs so a
 * relay never blocks a user update, and do nothing else.
 */
@UseFilters(AllExceptionsFilter)
@UseGuards(JwtDefaultGuard)
@Controller(HANDLER_CONTROLLER)
export class HandlerController {
    private static readonly ACK = { response: { success: true, error: null } };

    @Post(HANDLER_ROUTES.ADD_USER)
    public addUser() {
        return HandlerController.ACK;
    }

    @Post(HANDLER_ROUTES.REMOVE_USER)
    public removeUser() {
        return HandlerController.ACK;
    }

    @Post(HANDLER_ROUTES.ADD_USERS)
    public addUsers() {
        return HandlerController.ACK;
    }

    @Post(HANDLER_ROUTES.REMOVE_USERS)
    public removeUsers() {
        return HandlerController.ACK;
    }

    @Post(HANDLER_ROUTES.DROP_USERS_CONNECTIONS)
    public dropUsersConnections() {
        return { response: { success: true } };
    }

    @Post(HANDLER_ROUTES.DROP_IPS)
    public dropIps() {
        return { response: { success: true } };
    }
}
