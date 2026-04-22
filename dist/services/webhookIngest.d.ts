import type { Server } from "socket.io";
/**
 * Procesa el body del webhook de WhatsApp Cloud API y persiste mensajes entrantes.
 */
export declare function ingestWhatsAppWebhook(body: unknown, io: Server | null): Promise<void>;
//# sourceMappingURL=webhookIngest.d.ts.map