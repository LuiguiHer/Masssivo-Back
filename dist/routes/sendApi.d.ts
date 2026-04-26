import { Router } from "express";
import type { Server } from "socket.io";
type SendApiDeps = {
    jwtSecret: string;
    serwpSendUrl: string;
    /** Opcional: proxy a masssivo-qr-wa (mismas claves en MASSIVO_QR_WA_KEY que INTERNAL del microservicio). */
    masssivoQrWaBaseUrl?: string;
    masssivoQrWaKey?: string;
    qrInboxServiceUrl?: string;
    qrInboxServiceKey?: string;
    /** masssivo-media (MinIO) — opcional; si falta, plantilla imagen solo por URL. */
    mediaServiceUrl?: string;
    mediaServiceKey?: string;
    mediaPublicBaseUrl?: string;
    getIo?: () => Server | undefined;
};
export declare function createSendApiRouter(deps: SendApiDeps): Router;
export {};
//# sourceMappingURL=sendApi.d.ts.map