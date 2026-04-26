import type { Express } from "express";
import type { Server } from "socket.io";
export type CreateAppOptions = {
    webhookVerifyToken?: string;
    checkWebhookVerifyToken?: (token: string) => Promise<boolean>;
    onWebhookVerifySuccess?: (token: string) => Promise<void> | void;
    onWebhook?: (body: unknown) => void;
    sendJwtSecret: string;
    serwpSendUrl: string;
    masssivoQrWaBaseUrl?: string;
    masssivoQrWaKey?: string;
    qrInboxServiceUrl?: string;
    qrInboxServiceKey?: string;
    mediaServiceUrl?: string;
    mediaServiceKey?: string;
    mediaPublicBaseUrl?: string;
    getIo?: () => Server | undefined;
};
export declare function createApp(opts: CreateAppOptions): Express;
//# sourceMappingURL=app.d.ts.map