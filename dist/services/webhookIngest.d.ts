import type { Server } from "socket.io";
/**
 * Procesa el body del webhook de WhatsApp Cloud API: mensajes entrantes + estados de entrega salientes.
 */
export declare function ingestWhatsAppWebhook(body: unknown, io: Server | undefined): Promise<void>;
//# sourceMappingURL=webhookIngest.d.ts.map