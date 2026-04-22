type RowLike = Record<string, unknown>;
/** Recalcula contadores de campaña a partir de rowResults (única fuente de verdad). */
export declare function computeDeliveryStatsFromRows(rowResults: RowLike[] | undefined | null): {
    sentCount: number;
    failCount: number;
    deliveredCount: number;
    deliveryFailedCount: number;
    pendingDeliveryCount: number;
};
/**
 * Evita que un PATCH desde el front (borrador con filas "pending") pise estados ya escritos por webhooks.
 */
export declare function mergeIncomingRowResultsWithExisting(existingRows: RowLike[] | undefined | null, incomingRows: RowLike[]): RowLike[];
export declare function syncMassCampaignRowFromWebhook(companyId: unknown, wamid: string, statusRaw: string, errors: unknown[] | undefined | null, ts: Date): Promise<void>;
export {};
//# sourceMappingURL=massCampaignDelivery.d.ts.map