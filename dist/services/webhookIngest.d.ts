import type { Server } from "socket.io";
type RealtimeEmitter = Pick<Server, "to">;
export type InboundInboxInput = {
    companyId: unknown;
    waId: string;
    wamid: string;
    timestamp: Date;
    type: string;
    bodyText?: string;
    payload?: unknown;
    profileName?: string;
    source?: "cloud" | "qr";
};
/**
 * Inserta un mensaje entrante en inbox de forma idempotente y notifica por websocket.
 * Retorna `true` si se creó un mensaje nuevo, `false` si era duplicado.
 */
export declare function ingestInboundInboxMessage(input: InboundInboxInput, io?: RealtimeEmitter): Promise<boolean>;
/**
 * Procesa el body del webhook de WhatsApp Cloud API: mensajes entrantes + estados de entrega salientes.
 */
export declare function ingestWhatsAppWebhook(body: unknown, io: Server | undefined): Promise<void>;
export {};
//# sourceMappingURL=webhookIngest.d.ts.map