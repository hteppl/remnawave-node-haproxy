import { BadRequestException, Body, Controller, Get, Post, UseFilters, UseGuards } from '@nestjs/common';

import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { JwtDefaultGuard } from '../../common/guards/jwt.guard';
import { StartRequestSchema } from '../../contract/schemas';
import { XRAY_CONTROLLER, XRAY_ROUTES } from '../../contract/api';
import { RelayService } from './relay.service';

/** On the panel's xray path: it drives node lifecycle through these three routes. */
@UseFilters(AllExceptionsFilter)
@UseGuards(JwtDefaultGuard)
@Controller(XRAY_CONTROLLER)
export class RelayController {
    constructor(private readonly relayService: RelayService) {}

    @Post(XRAY_ROUTES.START)
    public async start(@Body() body: unknown) {
        const parsed = StartRequestSchema.safeParse(body);

        if (!parsed.success) {
            throw new BadRequestException(
                `Invalid start payload: ${parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ')}`,
            );
        }

        return { response: await this.relayService.start(parsed.data) };
    }

    @Get(XRAY_ROUTES.STOP)
    public async stop() {
        return { response: await this.relayService.stop() };
    }

    @Get(XRAY_ROUTES.NODE_HEALTH_CHECK)
    public async healthCheck() {
        return { response: await this.relayService.healthCheck() };
    }
}
