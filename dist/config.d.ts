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
    /** BD principal WAPI (Masssivo). */
    mongodbUri: string;
    /** BD inbox QR (mismo host/credenciales que MONGODB_URI si se deriva). */
    mongodbQrInboxUri: string;
    /** Auth / portal send */
    sendJwtSecret: string;
    serwpSendUrl: string;
    /** Formulario landing — destinatarios WhatsApp (solo dígitos, separados por comas). Ej: 573001112233,573004445556 */
    numberListWhats: string | undefined;
    /** Microservicio masssivo-qr-wa (Baileys, solo localhost; el proxy añade JWT → companyId). */
    masssivoQrWaUrl: string;
    masssivoQrWaKey: string | undefined;
    /** Servicio separado de persistencia QR Inbox */
    qrInboxServiceUrl: string;
    qrInboxServiceKey: string | undefined;
    /** masssivo-media (MinIO). Si faltan, las plantillas QR con imagen solo aceptan URL pública (legacy). */
    mediaServiceUrl: string;
    mediaServiceKey: string | undefined;
    /** Mismo prefijo que MEDIA_PUBLIC_BASE_URL en masssivo-media (URL pública de objetos, sin / final). */
    mediaPublicBaseUrl: string | undefined;
};
//# sourceMappingURL=config.d.ts.map