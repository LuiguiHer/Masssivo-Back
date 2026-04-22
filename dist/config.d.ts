import "dotenv/config";
/** Credenciales globales opcionales (el portal usa credenciales por empresa en MongoDB). */
export declare const config: {
    accessToken: string;
    graphVersion: string;
    phoneNumberId: string;
    wabaId: string | undefined;
    businessId: string | undefined;
    webhookVerifyToken: string | undefined;
    port: number;
    /** Base de datos del dashboard / inbox */
    /** Por defecto misma BD que serWP (`serwp`) si no defines MONGODB_URI. */
    mongodbUri: string;
    /** Auth / portal send */
    sendJwtSecret: string;
    serwpSendUrl: string;
};
//# sourceMappingURL=config.d.ts.map