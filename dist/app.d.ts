import type { Express } from "express";
export type CreateAppOptions = {
    webhookVerifyToken?: string;
    checkWebhookVerifyToken?: (token: string) => Promise<boolean>;
    onWebhookVerifySuccess?: (token: string) => Promise<void> | void;
    onWebhook?: (body: unknown) => void;
    sendJwtSecret: string;
    serwpSendUrl: string;
};
export declare function createApp(opts: CreateAppOptions): Express;
//# sourceMappingURL=app.d.ts.map