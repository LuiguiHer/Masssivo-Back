import { Router } from "express";
import { Chat } from "../models/Chat.js";
import { Client } from "../models/Client.js";
import { Message } from "../models/Message.js";
import { getQrInboxModels } from "../models/qrInboxStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { canonicalWaId, waIdAliases, waIdGroupKey } from "../services/waId.js";
function inboundMediaFromPayload(payload) {
    if (!payload || typeof payload !== "object")
        return {};
    const p = payload;
    const md = p.mediaDownload;
    const mdObj = md && typeof md === "object" ? md : null;
    const inlineBase64 = typeof mdObj?.inlineBase64 === "string" ? mdObj.inlineBase64 : "";
    const mdMime = typeof mdObj?.mimeType === "string" ? mdObj.mimeType : undefined;
    const mdFileName = typeof mdObj?.fileName === "string" ? mdObj.fileName : undefined;
    const msg = p.message;
    const msgObj = msg && typeof msg === "object" ? msg : null;
    const imageMsg = msgObj?.imageMessage && typeof msgObj.imageMessage === "object" ? msgObj.imageMessage : null;
    const videoMsg = msgObj?.videoMessage && typeof msgObj.videoMessage === "object" ? msgObj.videoMessage : null;
    const docMsg = msgObj?.documentMessage && typeof msgObj.documentMessage === "object" ? msgObj.documentMessage : null;
    const audioMsg = msgObj?.audioMessage && typeof msgObj.audioMessage === "object" ? msgObj.audioMessage : null;
    const mimeType = mdMime ??
        (typeof imageMsg?.mimetype === "string" ? imageMsg.mimetype : undefined) ??
        (typeof videoMsg?.mimetype === "string" ? videoMsg.mimetype : undefined) ??
        (typeof docMsg?.mimetype === "string" ? docMsg.mimetype : undefined) ??
        (typeof audioMsg?.mimetype === "string" ? audioMsg.mimetype : undefined);
    const fileName = mdFileName ??
        (typeof docMsg?.fileName === "string" ? docMsg.fileName : undefined) ??
        (typeof docMsg?.title === "string" ? docMsg.title : undefined);
    const mediaDataUrl = inlineBase64 && mimeType ? `data:${mimeType};base64,${inlineBase64}` : undefined;
    const mediaId = (typeof imageMsg?.id === "string" ? imageMsg.id : undefined) ??
        (typeof videoMsg?.id === "string" ? videoMsg.id : undefined) ??
        (typeof docMsg?.id === "string" ? docMsg.id : undefined) ??
        (typeof audioMsg?.id === "string" ? audioMsg.id : undefined);
    return { mimeType, fileName, mediaDataUrl, mediaId };
}
/**
 * Inbox: cabecera de plantilla (imagen) y pie, guardados al enviar o parseados
 * de `payload.template.components` (mensajes antiguos).
 */
function outTemplateInboxFromPayload(m) {
    const p = m.payload;
    if (m.type !== "template" || typeof p !== "object" || p === null) {
        return {};
    }
    const pl = p;
    const direct = pl.inboxTemplateDisplay;
    if (direct && typeof direct === "object" && direct !== null) {
        const d = direct;
        return {
            templateHeaderImageUrl: typeof d.headerImageUrl === "string" ? d.headerImageUrl : undefined,
            templateHeaderImageMediaId: typeof d.headerImageMediaId === "string" ? d.headerImageMediaId : undefined,
            templateFooterText: typeof d.footerText === "string" ? d.footerText : undefined,
        };
    }
    const tpl = pl.template;
    if (!tpl || typeof tpl !== "object" || tpl === null) {
        return {};
    }
    const t = tpl;
    const comps = Array.isArray(t.components) ? t.components : [];
    const out = {};
    for (const c of comps) {
        if (!c || typeof c !== "object")
            continue;
        const comp = c;
        if (String(comp.type ?? "").toLowerCase() !== "header")
            continue;
        for (const param of comp.parameters ?? []) {
            if (!param || typeof param !== "object")
                continue;
            const pr = param;
            if (pr.type === "image" && pr.image && typeof pr.image === "object") {
                if (typeof pr.image.link === "string" && pr.image.link.trim()) {
                    out.templateHeaderImageUrl = pr.image.link.trim();
                }
                if (typeof pr.image.id === "string" && pr.image.id.trim()) {
                    out.templateHeaderImageMediaId = pr.image.id.trim();
                }
            }
        }
    }
    return out;
}
export function createInboxRouter(jwtSecret) {
    const r = Router();
    const auth = requireAuth(jwtSecret);
    const qrInboxServiceUrl = String(process.env.QR_INBOX_SERVICE_URL ?? "http://127.0.0.1:3010").replace(/\/$/, "");
    async function proxyQrInbox(req, res, targetPath) {
        try {
            const method = req.method || "GET";
            const authz = req.header("authorization") ?? "";
            const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
            const outUrl = `${qrInboxServiceUrl}${targetPath}${qs}`;
            const fr = await fetch(outUrl, {
                method,
                headers: {
                    ...(authz ? { Authorization: authz } : {}),
                    ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
                },
                body: method === "GET" ? undefined : JSON.stringify(req.body ?? {}),
            });
            const raw = await fr.text();
            if (!raw)
                return res.status(fr.status).end();
            try {
                return res.status(fr.status).json(JSON.parse(raw));
            }
            catch {
                return res.status(fr.status).send(raw);
            }
        }
        catch (e) {
            return res.status(502).json({ error: e instanceof Error ? e.message : "qr inbox proxy failed" });
        }
    }
    async function listChats(req, res, channel) {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const { QrChat } = getQrInboxModels();
        const ChatModel = channel === "qr" ? QrChat : Chat;
        const chats = await ChatModel.find({ companyId: req.auth.companyId }).sort({ lastMessageAt: -1 }).lean();
        const clients = await Client.find({ companyId: req.auth.companyId }).select({ name: 1, phone: 1 }).lean();
        const clientNameByWaId = new Map();
        for (const client of clients) {
            const name = String(client.name ?? "").trim();
            const phone = canonicalWaId(String(client.phone ?? ""));
            if (!name || !phone)
                continue;
            for (const alias of waIdAliases(phone)) {
                clientNameByWaId.set(alias, name);
            }
            const key = waIdGroupKey(phone);
            if (key)
                clientNameByWaId.set(key, name);
        }
        const grouped = new Map();
        for (const c of chats) {
            const key = waIdGroupKey(c.waId);
            const prev = grouped.get(key);
            if (!prev) {
                grouped.set(key, { latest: c, unreadCount: Math.max(0, Number(c.unreadCount ?? 0)) });
                continue;
            }
            const latest = new Date(c.lastMessageAt).getTime() > new Date(prev.latest.lastMessageAt).getTime() ? c : prev.latest;
            grouped.set(key, {
                latest,
                unreadCount: prev.unreadCount + Math.max(0, Number(c.unreadCount ?? 0)),
            });
        }
        return res.json([...grouped.values()]
            .sort((a, b) => new Date(b.latest.lastMessageAt).getTime() - new Date(a.latest.lastMessageAt).getTime())
            .map((g) => ({
            waId: canonicalWaId(g.latest.waId),
            displayName: clientNameByWaId.get(canonicalWaId(g.latest.waId)) ??
                clientNameByWaId.get(waIdGroupKey(g.latest.waId)) ??
                g.latest.displayName ??
                g.latest.waId,
            lastMessagePreview: g.latest.lastMessagePreview,
            lastMessageAt: g.latest.lastMessageAt,
            unreadCount: g.unreadCount,
        })));
    }
    async function markChatRead(req, res, channel) {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const { QrChat } = getQrInboxModels();
        const ChatModel = channel === "qr" ? QrChat : Chat;
        const id = canonicalWaId(req.params.waId);
        if (!id)
            return res.status(400).json({ error: "waId inválido" });
        const aliases = waIdAliases(id);
        await ChatModel.updateMany({ companyId: req.auth.companyId, waId: { $in: aliases } }, { $set: { unreadCount: 0 } });
        return res.json({ ok: true });
    }
    async function listMessages(req, res, channel) {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const { QrMessage } = getQrInboxModels();
        const MessageModel = channel === "qr" ? QrMessage : Message;
        const { waId } = req.params;
        const id = canonicalWaId(waId);
        const aliases = waIdAliases(id);
        const limit = Math.min(Number(req.query.limit) || 80, 200);
        const beforeRaw = req.query.before;
        const before = beforeRaw ? new Date(String(beforeRaw)) : undefined;
        const q = {
            companyId: req.auth.companyId,
            waId: { $in: aliases },
        };
        if (before && !Number.isNaN(before.getTime())) {
            q.createdAt = { $lt: before };
        }
        const messages = (await MessageModel.find(q)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean());
        return res.json(messages.reverse().map((m) => {
            const tpl = outTemplateInboxFromPayload(m);
            const inboundMedia = inboundMediaFromPayload(m.payload);
            return {
                wamid: m.wamid,
                direction: m.direction,
                type: m.type,
                bodyText: m.bodyText,
                preview: m.bodyText ??
                    (typeof m.payload === "object" && m.payload && "caption" in m.payload
                        ? String(m.payload.caption)
                        : undefined),
                timestamp: m.timestamp ?? m.createdAt,
                createdAt: m.createdAt,
                deliveryStatus: m.deliveryStatus ?? undefined,
                deliveryErrors: m.deliveryErrors ?? undefined,
                deliveryUpdatedAt: m.deliveryUpdatedAt ?? undefined,
                mediaDataUrl: inboundMedia.mediaDataUrl,
                mimeType: (typeof m.payload === "object" && m.payload
                    ? m.payload.image?.mime_type ??
                        m.payload.video?.mime_type ??
                        m.payload.document?.mime_type ??
                        m.payload.audio?.mime_type
                    : undefined) ?? inboundMedia.mimeType,
                fileName: (typeof m.payload === "object" && m.payload
                    ? m.payload.document?.filename
                    : undefined) ?? inboundMedia.fileName,
                mediaId: (typeof m.payload === "object" && m.payload
                    ? m.payload.image?.id ??
                        m.payload.video?.id ??
                        m.payload.document?.id ??
                        m.payload.audio?.id
                    : undefined) ?? inboundMedia.mediaId,
                ...tpl,
            };
        }));
    }
    r.get("/chats", auth, async (req, res) => listChats(req, res, "cloud"));
    r.post("/chats/:waId/read", auth, async (req, res) => markChatRead(req, res, "cloud"));
    r.get("/chats/:waId/messages", auth, async (req, res) => listMessages(req, res, "cloud"));
    r.get("/qr/chats", auth, async (req, res) => proxyQrInbox(req, res, "/v1/chats"));
    r.post("/qr/chats/:waId/read", auth, async (req, res) => proxyQrInbox(req, res, `/v1/chats/${encodeURIComponent(String(req.params.waId ?? ""))}/read`));
    r.get("/qr/chats/:waId/messages", auth, async (req, res) => proxyQrInbox(req, res, `/v1/chats/${encodeURIComponent(String(req.params.waId ?? ""))}/messages`));
    return r;
}
//# sourceMappingURL=inboxApi.js.map