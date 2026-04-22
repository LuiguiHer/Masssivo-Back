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
    /** Por defecto misma BD que serWP (`serwp`) si no defines MONGODB_URI. */
    mongodbUri: opt("MONGODB_URI") ?? "mongodb://127.0.0.1:27017/serwp",
    /** Auth / portal send */
    sendJwtSecret: req("SEND_JWT_SECRET"),
    serwpSendUrl: opt("SERWP_SEND_URL") ?? "http://127.0.0.1:8444/api/send",
};
//# sourceMappingURL=config.js.map