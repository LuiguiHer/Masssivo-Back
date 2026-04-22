import "dotenv/config";
import http from "node:http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { CompanyWebhookVerifyToken } from "./models/CompanyWebhookVerifyToken.js";
import { ingestWhatsAppWebhook } from "./services/webhookIngest.js";
let io;
const app = createApp({
    webhookVerifyToken: config.webhookVerifyToken,
    checkWebhookVerifyToken: async (token) => {
        if (!token?.trim())
            return false;
        const tokenTrim = token.trim();
        const generatedToken = await CompanyWebhookVerifyToken.findOne({ token: tokenTrim }).select({ _id: 1 }).lean();
        return Boolean(generatedToken);
    },
    onWebhookVerifySuccess: async (token) => {
        const tokenTrim = token.trim();
        const now = new Date();
        const hit = (await CompanyWebhookVerifyToken.findOneAndUpdate({ token: tokenTrim }, { $set: { verifiedAt: now } }, { new: true }).lean());
        if (hit?.companyId) {
            io?.to(`company:${String(hit.companyId)}`).emit("webhook:status", {
                connected: true,
                verifiedAt: now.toISOString(),
            });
        }
    },
    sendJwtSecret: config.sendJwtSecret,
    serwpSendUrl: config.serwpSendUrl,
    onWebhook: (body) => {
        void ingestWhatsAppWebhook(body, io).catch((e) => console.error("[webhook ingest]", e));
    },
});
const httpServer = http.createServer(app);
io = new Server(httpServer, {
    path: "/inbox/socket.io/",
    cors: { origin: true, methods: ["GET", "POST"] },
});
io.use((socket, next) => {
    try {
        const token = (typeof socket.handshake.auth?.token === "string" && socket.handshake.auth.token) ||
            (typeof socket.handshake.query?.token === "string" ? String(socket.handshake.query.token) : "");
        if (!token)
            return next(new Error("unauthorized"));
        const payload = jwt.verify(token, config.sendJwtSecret);
        if (typeof payload === "string" || !payload.sub)
            return next(new Error("unauthorized"));
        const companyId = "companyId" in payload ? payload.companyId : undefined;
        if (!companyId)
            return next(new Error("unauthorized"));
        socket.join(`company:${String(companyId)}`);
        return next();
    }
    catch {
        return next(new Error("unauthorized"));
    }
});
io.on("connection", () => {
    /* dashboard conectado */
});
async function main() {
    await mongoose.connect(config.mongodbUri);
    console.log("[mongo] conectado:", config.mongodbUri);
    httpServer.listen(config.port, "0.0.0.0", () => {
        console.log(`Servidor en http://0.0.0.0:${config.port}`);
        console.log(`Webhook: /webhook | Inbox API: /inbox/v1 | Socket.io: /inbox/socket.io/`);
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=index.js.map