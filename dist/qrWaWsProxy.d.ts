import type { Server as HttpServer } from "node:http";
/**
 * El navegador abre wss con JWT (query) al mismo origen; aquí reenviamos a masssivo-qr-wa con la clave interna.
 * Registra un listener `upgrade` (solo atiende /api/send/qr/ws).
 */
export declare function attachQrWaWebSocketProxy(httpServer: HttpServer, jwtSecret: string): void;
//# sourceMappingURL=qrWaWsProxy.d.ts.map