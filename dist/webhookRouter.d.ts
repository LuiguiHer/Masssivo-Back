type VerifyTokenChecker = (token: string) => Promise<boolean>;
type VerifyTokenSuccessHandler = (token: string) => Promise<void> | void;
/**
 * Verificación webhook Meta (GET) y recepción de eventos (POST).
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export declare function createWebhookRouter(verifyToken: string | undefined, onPayload?: (body: unknown) => void, checkVerifyToken?: VerifyTokenChecker, onVerifyTokenSuccess?: VerifyTokenSuccessHandler): import("express-serve-static-core").Router;
export {};
//# sourceMappingURL=webhookRouter.d.ts.map