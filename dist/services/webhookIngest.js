// @ts-nocheck — modelos legacy y tipos de Query de Mongoose
import { Chat } from "../models/Chat.js";
import { Client } from "../models/Client.js";
import { CompanyWhatsappConfig } from "../models/CompanyWhatsappConfig.js";
import { CompanyWebhookVerifyToken } from "../models/CompanyWebhookVerifyToken.js";
import { Message } from "../models/Message.js";
import { getQrInboxModels } from "../models/qrInboxStore.js";
import { syncMassCampaignRowFromWebhook } from "./massCampaignDelivery.js";
import { canonicalWaId, waIdAliases } from "./waId.js";
import { takeLiveTestIfActive } from "./webhookTestSession.js";
function extractProfileName(value, waId) {
    const c = value.contacts?.find((x) => x.wa_id === waId || x.wa_id === waId.replace(/\D/g, ""));
    return c?.profile?.name;
}
function extractSocketMediaFromPayload(payload) {
    if (!payload || typeof payload !== "object")
        return {};
    const p = payload;
    const md = p.mediaDownload && typeof p.mediaDownload === "object" ? p.mediaDownload : null;
    const inlineBase64 = typeof md?.inlineBase64 === "string" ? md.inlineBase64 : "";
    const msg = p.message && typeof p.message === "object" ? p.message : null;
    const imageMsg = msg?.imageMessage && typeof msg.imageMessage === "object" ? msg.imageMessage : null;
    const videoMsg = msg?.videoMessage && typeof msg.videoMessage === "object" ? msg.videoMessage : null;
    const docMsg = msg?.documentMessage && typeof msg.documentMessage === "object" ? msg.documentMessage : null;
    const audioMsg = msg?.audioMessage && typeof msg.audioMessage === "object" ? msg.audioMessage : null;
    const mimeType = (typeof md?.mimeType === "string" ? md.mimeType : undefined) ??
        (typeof imageMsg?.mimetype === "string" ? imageMsg.mimetype : undefined) ??
        (typeof videoMsg?.mimetype === "string" ? videoMsg.mimetype : undefined) ??
        (typeof docMsg?.mimetype === "string" ? docMsg.mimetype : undefined) ??
        (typeof audioMsg?.mimetype === "string" ? audioMsg.mimetype : undefined);
    const mediaDataUrl = inlineBase64 && mimeType ? `data:${mimeType};base64,${inlineBase64}` : undefined;
    const mediaId = (typeof imageMsg?.id === "string" ? imageMsg.id : undefined) ??
        (typeof videoMsg?.id === "string" ? videoMsg.id : undefined) ??
        (typeof docMsg?.id === "string" ? docMsg.id : undefined) ??
        (typeof audioMsg?.id === "string" ? audioMsg.id : undefined);
    const fileName = (typeof docMsg?.fileName === "string" ? docMsg.fileName : undefined) ??
        (typeof docMsg?.title === "string" ? docMsg.title : undefined);
    return { mediaId, mediaDataUrl, mimeType, fileName };
}
/**
 * Inserta un mensaje entrante en inbox de forma idempotente y notifica por websocket.
 * Retorna `true` si se creó un mensaje nuevo, `false` si era duplicado.
 */
export async function ingestInboundInboxMessage(input, io) {
    const from = canonicalWaId(input.waId);
    const wamid = String(input.wamid ?? "").trim();
    if (!from || !wamid)
        return false;
    const timestamp = input.timestamp instanceof Date && !Number.isNaN(input.timestamp.getTime()) ? input.timestamp : new Date();
    const bodyText = input.bodyText ? String(input.bodyText) : undefined;
    const preview = bodyText?.trim() || `[${String(input.type || "unknown")}]`;
    const companyId = input.companyId;
    const source = input.source === "qr" ? "qr" : "cloud";
    const channel = source === "qr" ? "qr_baileys" : "cloud_api";
    const companyRoom = `company:${String(companyId)}`;
    const { QrChat, QrMessage } = getQrInboxModels();
    const ChatModel = source === "qr" ? QrChat : Chat;
    const MessageModel = source === "qr" ? QrMessage : Message;
    const client = await Client.findOne({ companyId, phone: { $in: waIdAliases(from) } }).select({ name: 1 }).lean();
    const preferredDisplayName = String(client?.name ?? "").trim() || String(input.profileName ?? "").trim();
    const messageUpsert = await MessageModel.updateOne({ companyId, wamid }, {
        $setOnInsert: {
            companyId,
            waId: from,
            wamid,
            direction: "in",
            type: String(input.type || "unknown"),
            bodyText,
            payload: input.payload,
            timestamp,
        },
    }, { upsert: true });
    const isNewMessage = Boolean(messageUpsert.upsertedCount);
    if (!isNewMessage)
        return false;
    await ChatModel.findOneAndUpdate({ companyId, waId: from }, {
        $set: {
            lastMessageAt: timestamp,
            lastMessagePreview: preview,
            ...(preferredDisplayName ? { displayName: preferredDisplayName } : {}),
        },
        $inc: { unreadCount: 1 },
        $setOnInsert: { companyId, waId: from },
    }, { upsert: true });
    io?.to(companyRoom).emit("message:new", {
        channel,
        waId: from,
        message: {
            wamid,
            direction: "in",
            type: String(input.type || "unknown"),
            bodyText,
            preview,
            timestamp: timestamp.toISOString(),
            ...extractSocketMediaFromPayload(input.payload),
        },
    });
    io?.to(companyRoom).emit("chat:updated", {
        channel,
        waId: from,
        displayName: preferredDisplayName,
        lastMessagePreview: preview,
        lastMessageAt: timestamp.toISOString(),
        unreadCountDelta: 1,
    });
    if (takeLiveTestIfActive(String(companyId))) {
        const now = new Date();
        await CompanyWebhookVerifyToken.updateOne({ companyId }, { $set: { liveTestPassedAt: now } });
        io?.to(companyRoom).emit("webhook:live-test:success", {
            ok: true,
            message: "Tu conexión al webhook se estableció correctamente.",
            passedAt: now.toISOString(),
        });
    }
    return true;
}
/**
 * Estados de entrega que envía Meta en `value.statuses` (sent → delivered → read, o failed).
 */
async function ingestDeliveryStatuses(statuses, companyId, companyRoom, io) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const st of statuses) {
        const wamid = String(st.id ?? "").trim();
        if (!wamid)
            continue;
        const recipientId = canonicalWaId(String(st.recipient_id ?? ""));
        const tsSec = Number(st.timestamp);
        const ts = Number.isFinite(tsSec) ? new Date(tsSec * 1000) : new Date();
        const status = String(st.status ?? "");
        const payload = {
            deliveryStatus: status,
            deliveryErrors: st.errors ?? null,
            deliveryUpdatedAt: ts,
        };
        /** Meta puede mandar el webhook antes de que termine el upsert del envío → reintentos cortos */
        let applied = await Message.updateOne({ companyId, wamid }, { $set: payload });
        if (applied.matchedCount === 0) {
            const row = await Message.findOne({ wamid }).select({ companyId: 1 }).lean();
            if (row && String(row.companyId) === String(companyId)) {
                applied = await Message.updateOne({ _id: row._id }, { $set: payload });
            }
            else if (row && String(row.companyId) !== String(companyId)) {
                console.warn("[whatsapp/webhook] delivery status: wamid en otra empresa, se ignora", JSON.stringify({ wamid, expectedCompanyId: String(companyId), docCompanyId: String(row.companyId) }));
            }
            else {
                await sleep(400);
                applied = await Message.updateOne({ companyId, wamid }, { $set: payload });
                if (applied.matchedCount === 0) {
                    await sleep(1200);
                    applied = await Message.updateOne({ companyId, wamid }, { $set: payload });
                }
                if (applied.matchedCount === 0) {
                    console.warn("[whatsapp/webhook] delivery status: no se pudo guardar en Message (¿llegó antes que el insert del envío?)", JSON.stringify({ companyId: String(companyId), wamid, status }));
                }
            }
        }
        const logBase = {
            companyId: String(companyId),
            wamid,
            status,
            recipientId,
            errors: st.errors ?? null,
        };
        const isFailed = status === "failed" || (Array.isArray(st.errors) && st.errors.length > 0);
        if (isFailed) {
            console.warn("[whatsapp/webhook] delivery FAILED", JSON.stringify(logBase));
        }
        else {
            console.info("[whatsapp/webhook] message status", JSON.stringify(logBase));
        }
        io?.to(companyRoom).emit("message:delivery", {
            waId: recipientId,
            wamid,
            status,
            errors: st.errors ?? null,
            timestamp: ts.toISOString(),
        });
        try {
            await syncMassCampaignRowFromWebhook(companyId, wamid, status, st.errors ?? null, ts);
        }
        catch (e) {
            console.warn("[whatsapp/webhook] mass campaign row sync failed", String(e));
        }
    }
}
/**
 * Procesa el body del webhook de WhatsApp Cloud API: mensajes entrantes + estados de entrega salientes.
 */
export async function ingestWhatsAppWebhook(body, io) {
    if (!body || typeof body !== "object")
        return;
    const root = body;
    if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry))
        return;
    for (const entry of root.entry) {
        for (const change of entry.changes ?? []) {
            if (change.field !== "messages" || !change.value)
                continue;
            const value = change.value;
            const msgs = value.messages;
            const statuses = value.statuses;
            const hasMsgs = Array.isArray(msgs) && msgs.length > 0;
            const hasStatuses = Array.isArray(statuses) && statuses.length > 0;
            if (!hasMsgs && !hasStatuses)
                continue;
            const phoneNumberId = value.metadata?.phone_number_id;
            if (!phoneNumberId)
                continue;
            const waConfig = await CompanyWhatsappConfig.findOne({ waPhoneNumberId: String(phoneNumberId) }).select({ companyId: 1 }).lean();
            if (!waConfig) {
                console.warn("[ingest] webhook sin empresa registrada para phone_number_id=", phoneNumberId);
                continue;
            }
            const companyId = waConfig.companyId;
            const companyRoom = `company:${String(companyId)}`;
            if (hasMsgs && msgs) {
                for (const m of msgs) {
                    const from = canonicalWaId(m.from ?? "");
                    if (!from || !m.id)
                        continue;
                    const tsSec = Number(m.timestamp);
                    const timestamp = Number.isFinite(tsSec) ? new Date(tsSec * 1000) : new Date();
                    const bodyText = m.type === "text" ? m.text?.body : undefined;
                    const displayName = extractProfileName(value, m.from ?? "") ?? extractProfileName(value, from);
                    const isNewMessage = await ingestInboundInboxMessage({
                        companyId,
                        waId: from,
                        wamid: String(m.id ?? ""),
                        timestamp,
                        type: m.type ?? "unknown",
                        bodyText,
                        payload: m,
                        profileName: displayName,
                    }, io);
                    if (!isNewMessage)
                        continue;
                }
            }
            if (hasStatuses && statuses) {
                await ingestDeliveryStatuses(statuses, companyId, companyRoom, io);
            }
        }
    }
}
//# sourceMappingURL=webhookIngest.js.map