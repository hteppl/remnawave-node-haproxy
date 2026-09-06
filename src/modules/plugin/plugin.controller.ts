import { Controller, Post, UseFilters, UseGuards } from '@nestjs/common';

import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { JwtDefaultGuard } from '../../common/guards/jwt.guard';
import { PLUGIN_CONTROLLER, PLUGIN_ROUTES } from '../../contract/api';

/**
 * Plugins need xray's log stream and the node's firewall. Declined explicitly so
 * the panel reports them as not accepted instead of awaiting reports.
 */
@UseFilters(AllExceptionsFilter)
@UseGuards(JwtDefaultGuard)
@Controller(PLUGIN_CONTROLLER)
export class PluginController {
    private static readonly DECLINED = { response: { accepted: false } };

    @Post(PLUGIN_ROUTES.SYNC)
    public sync() {
        return PluginController.DECLINED;
    }

    @Post(PLUGIN_ROUTES.TORRENT_BLOCKER.COLLECT)
    public collectReports() {
        return { response: { reports: [] } };
    }

    @Post(PLUGIN_ROUTES.NFTABLES.BLOCK_IPS)
    public blockIps() {
        return PluginController.DECLINED;
    }

    @Post(PLUGIN_ROUTES.NFTABLES.UNBLOCK_IPS)
    public unblockIps() {
        return PluginController.DECLINED;
    }

    @Post(PLUGIN_ROUTES.NFTABLES.RECREATE_TABLES)
    public recreateTables() {
        return PluginController.DECLINED;
    }
}
