import { Body, Controller, Get, Post, UseFilters, UseGuards } from '@nestjs/common';

import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { JwtDefaultGuard } from '../../common/guards/jwt.guard';
import { ResetRequestSchema, TagResetRequestSchema } from '../../contract/schemas';
import { STATS_CONTROLLER, STATS_ROUTES } from '../../contract/api';
import { getGeocheckStub } from './geocheck.stub';
import { StatsService } from './stats.service';

@UseFilters(AllExceptionsFilter)
@UseGuards(JwtDefaultGuard)
@Controller(STATS_CONTROLLER)
export class StatsController {
    constructor(private readonly statsService: StatsService) {}

    @Get(STATS_ROUTES.GET_SYSTEM_STATS)
    public async getSystemStats() {
        return { response: await this.statsService.getSystemStats() };
    }

    @Post(STATS_ROUTES.GET_ALL_INBOUNDS_STATS)
    public async getAllInboundsStats(@Body() body: unknown) {
        const { reset } = ResetRequestSchema.parse(body ?? {});
        const stats = await this.statsService.getAllInboundsStats(reset);

        return {
            response: {
                inbounds: stats.map(({ tag, uplink, downlink }) => ({
                    inbound: tag,
                    uplink,
                    downlink,
                })),
            },
        };
    }

    @Post(STATS_ROUTES.GET_INBOUND_STATS)
    public async getInboundStats(@Body() body: unknown) {
        const { tag, reset } = TagResetRequestSchema.parse(body ?? {});
        const stats = await this.statsService.getInboundStats(tag, reset);

        return {
            response: { inbound: stats.tag, uplink: stats.uplink, downlink: stats.downlink },
        };
    }

    @Post(STATS_ROUTES.GET_ALL_OUTBOUNDS_STATS)
    public getAllOutboundsStats() {
        return { response: { outbounds: [] } };
    }

    @Post(STATS_ROUTES.GET_OUTBOUND_STATS)
    public getOutboundStats(@Body() body: unknown) {
        const { tag } = TagResetRequestSchema.parse(body ?? {});
        const stats = this.statsService.getOutboundStats(tag);

        return {
            response: { outbound: stats.tag, uplink: stats.uplink, downlink: stats.downlink },
        };
    }

    @Post(STATS_ROUTES.GET_COMBINED_STATS)
    public async getCombinedStats(@Body() body: unknown) {
        const { reset } = ResetRequestSchema.parse(body ?? {});
        const inbounds = await this.statsService.getAllInboundsStats(reset);

        return {
            response: {
                inbounds: inbounds.map(({ tag, uplink, downlink }) => ({
                    inbound: tag,
                    uplink,
                    downlink,
                })),
                outbounds: [],
            },
        };
    }

    // L4 relaying never sees a username, so per-user answers stay empty; the origin
    // node accounts those users. get-users-stats is the exception: see the service.

    @Post(STATS_ROUTES.GET_USER_ONLINE_STATUS)
    public getUserOnlineStatus() {
        return { response: { isOnline: false } };
    }

    @Post(STATS_ROUTES.GET_USERS_STATS)
    public async getUsersStats() {
        return { response: { users: await this.statsService.getUsersStats() } };
    }

    @Post(STATS_ROUTES.GET_USER_IP_LIST)
    public getUserIpList() {
        return { response: { ips: [] } };
    }

    @Get(STATS_ROUTES.GET_USERS_IP_LIST)
    public getUsersIpList() {
        return { response: { users: [] } };
    }

    @Post(STATS_ROUTES.GET_GEOCHECK)
    public getGeocheck() {
        return { response: getGeocheckStub() };
    }
}
