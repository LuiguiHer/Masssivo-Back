import cors from "cors";
import express from "express";
import { createInboxRouter } from "./routes/inboxApi.js";
import { createSendApiRouter } from "./routes/sendApi.js";
import { createWebhookRouter } from "./webhookRouter.js";
export function createApp(opts) {
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    app.use(cors({
        origin: true,
        credentials: true,
    }));
    app.get("/health", (_req, res) => {
        res.json({ ok: true });
    });
    app.use("/api/send", createSendApiRouter({
        jwtSecret: opts.sendJwtSecret,
        serwpSendUrl: opts.serwpSendUrl,
        masssivoQrWaBaseUrl: opts.masssivoQrWaBaseUrl,
        masssivoQrWaKey: opts.masssivoQrWaKey,
        qrInboxServiceUrl: opts.qrInboxServiceUrl,
        qrInboxServiceKey: opts.qrInboxServiceKey,
        mediaServiceUrl: opts.mediaServiceUrl,
        mediaServiceKey: opts.mediaServiceKey,
        mediaPublicBaseUrl: opts.mediaPublicBaseUrl,
        getIo: opts.getIo,
    }));
    app.use("/inbox/v1", createInboxRouter(opts.sendJwtSecret));
    app.use(createWebhookRouter(opts.webhookVerifyToken, opts.onWebhook, opts.checkWebhookVerifyToken, opts.onWebhookVerifySuccess));
    return app;
}
//# sourceMappingURL=app.js.map