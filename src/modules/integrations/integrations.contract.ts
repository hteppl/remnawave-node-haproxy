import { z } from 'zod';

import { NodeMetadataSchema } from '../../contract/schemas';

/**
 * Mirrors remnawave/node `integrations.contract.ts`. The panel merges every integration
 * attached to a node into one flat object; each picks the key it owns out of it.
 */

export const NODE_INTEGRATIONS = Symbol('NODE_INTEGRATIONS');

export type TNodeMetadata = z.infer<typeof NodeMetadataSchema>;

export interface INodeIntegrationResult {
    error: string | null;
}

export interface INodeIntegrationSyncOptions {
    integrationConfig: Record<string, unknown>;
    /** Absent on panels that predate node metadata. */
    nodeMetadata?: TNodeMetadata;
}

export interface INodeIntegration {
    readonly name: string;

    sync(options: INodeIntegrationSyncOptions): Promise<INodeIntegrationResult>;

    stop(): Promise<void>;
}
