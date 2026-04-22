export type CreateAppOptions = {
    webhookVerifyToken?: string;
    checkWebhookVerifyToken?: (token: string) => Promise<boolean>;
    onWebhookVerifySuccess?: (token: string) => Promise<void> | void;
    onWebhook?: (body: unknown) => void;
    sendJwtSecret: string;
    serwpSendUrl: string;
};
export declare function createApp(opts: CreateAppOptions): import("express-serve-static-core").Express;
//# sourceMappingURL=app.d.ts.map