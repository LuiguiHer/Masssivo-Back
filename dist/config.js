import "dotenv/config";
function req(name) {
    const v = process.env[name];
    if (!v?.trim())
        throw new Error(`Falta variable de entorno obligatoria: ${name}`);
    return v.trim();
}
function opt(name) {
    const v = process.env[name];
    return v?.trim() || undefined;
}
function deriveMongoQrInboxUri(primaryUri) {
    const explicit = opt("MONGODB_QR_INBOX_URI");
    if (explicit)
        return explicit;
    try {
        const u = new URL(primaryUri);
        u.pathname = "/masssivo_qr_inbox";
        return u.toString();
    }
    catch {
        return "mongodb://127.0.0.1:27017/masssivo_qr_inbox";
    }
}
/** Credenciales globales opcionales (el portal usa credenciales por empresa en MongoDB). */
export const config = {
    accessToken: opt("WA_ACCESS_TOKEN") ?? "",
    graphVersion: opt("GRAPH_API_VERSION") ?? "v21.0",
    phoneNumberId: opt("WA_PHONE_NUMBER_ID") ?? "",
    wabaId: opt("WA_WABA_ID"),
    businessId: opt("WA_BUSINESS_ID"),
    webhookVerifyToken: opt("WEBHOOK_VERIFY_TOKEN"),
    port: Number(process.env.PORT) || 3000,
    /** Base de datos del dashboard / inbox */
    /** BD principal WAPI (Masssivo). */
    mongodbUri: opt("MONGODB_URI") ?? "mongodb://127.0.0.1:27017/masssivo_wa",
    /** BD inbox QR (mismo host/credenciales que MONGODB_URI si se deriva). */
    mongodbQrInboxUri: deriveMongoQrInboxUri(opt("MONGODB_URI") ?? "mongodb://127.0.0.1:27017/masssivo_wa"),
    /** Auth / portal send */
    sendJwtSecret: req("SEND_JWT_SECRET"),
    serwpSendUrl: opt("SERWP_SEND_URL") ?? "http://127.0.0.1:8444/api/send",
    /** Formulario landing — destinatarios WhatsApp (solo dígitos, separados por comas). Ej: 573001112233,573004445556 */
    numberListWhats: opt("NumberListWhats"),
    /** Microservicio masssivo-qr-wa (Baileys, solo localhost; el proxy añade JWT → companyId). */
    masssivoQrWaUrl: opt("MASSIVO_QR_WA_URL") ?? "http://127.0.0.1:3840",
    masssivoQrWaKey: opt("MASSIVO_QR_WA_KEY"),
    /** Servicio separado de persistencia QR Inbox */
    qrInboxServiceUrl: opt("QR_INBOX_SERVICE_URL") ?? "http://127.0.0.1:3010",
    qrInboxServiceKey: opt("QR_INBOX_SERVICE_KEY") ?? opt("MASSIVO_QR_WA_KEY"),
    /** masssivo-media (MinIO). Si faltan, las plantillas QR con imagen solo aceptan URL pública (legacy). */
    mediaServiceUrl: opt("MEDIA_SERVICE_URL") ?? "http://127.0.0.1:3841",
    mediaServiceKey: opt("MEDIA_SERVICE_KEY"),
    /** Mismo prefijo que MEDIA_PUBLIC_BASE_URL en masssivo-media (URL pública de objetos, sin / final). */
    mediaPublicBaseUrl: opt("MEDIA_PUBLIC_BASE_URL")?.replace(/\/$/, ""),
};
//# sourceMappingURL=config.js.map