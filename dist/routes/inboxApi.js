import { Router } from "express";
import { Chat } from "../models/Chat.js";
import { Client } from "../models/Client.js";
import { Message } from "../models/Message.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { canonicalWaId, waIdAliases, waIdGroupKey } from "../services/waId.js";
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
      templateHeaderImageUrl: typeof d.headerImageUrl === "string" ? d.headerImageUrl : void 0,
      templateHeaderImageMediaId: typeof d.headerImageMediaId === "string" ? d.headerImageMediaId : void 0,
      templateFooterText: typeof d.footerText === "string" ? d.footerText : void 0
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
    if (!c || typeof c !== "object") continue;
    const comp = c;
    if (String(comp.type ?? "").toLowerCase() !== "header") continue;
    for (const param of comp.parameters ?? []) {
      if (!param || typeof param !== "object") continue;
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
function createInboxRouter(jwtSecret) {
  const r = Router();
  const auth = requireAuth(jwtSecret);
  r.get("/chats", auth, async (req, res) => {
    if (!req.auth?.companyId) return res.status(403).json({ error: "Debes configurar tu empresa primero" });
    const chats = await Chat.find({ companyId: req.auth.companyId }).sort({ lastMessageAt: -1 }).lean();
    const clients = await Client.find({ companyId: req.auth.companyId }).select({ name: 1, phone: 1 }).lean();
    const clientNameByWaId = /* @__PURE__ */ new Map();
    for (const client of clients) {
      const name = String(client.name ?? "").trim();
      const phone = canonicalWaId(String(client.phone ?? ""));
      if (!name || !phone) continue;
      for (const alias of waIdAliases(phone)) {
        clientNameByWaId.set(alias, name);
      }
      const key = waIdGroupKey(phone);
      if (key) clientNameByWaId.set(key, name);
    }
    const grouped = /* @__PURE__ */ new Map();
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
        unreadCount: prev.unreadCount + Math.max(0, Number(c.unreadCount ?? 0))
      });
    }
    res.json(
      [...grouped.values()].sort(
        (a, b) => new Date(b.latest.lastMessageAt).getTime() - new Date(a.latest.lastMessageAt).getTime()
      ).map((g) => ({
        waId: canonicalWaId(g.latest.waId),
        displayName: clientNameByWaId.get(canonicalWaId(g.latest.waId)) ?? clientNameByWaId.get(waIdGroupKey(g.latest.waId)) ?? g.latest.displayName ?? g.latest.waId,
        lastMessagePreview: g.latest.lastMessagePreview,
        lastMessageAt: g.latest.lastMessageAt,
        unreadCount: g.unreadCount
      }))
    );
  });
  r.post("/chats/:waId/read", auth, async (req, res) => {
    if (!req.auth?.companyId) return res.status(403).json({ error: "Debes configurar tu empresa primero" });
    const id = canonicalWaId(req.params.waId);
    if (!id) return res.status(400).json({ error: "waId inv\xE1lido" });
    const aliases = waIdAliases(id);
    await Chat.updateMany(
      { companyId: req.auth.companyId, waId: { $in: aliases } },
      { $set: { unreadCount: 0 } }
    );
    return res.json({ ok: true });
  });
  r.get("/chats/:waId/messages", auth, async (req, res) => {
    if (!req.auth?.companyId) return res.status(403).json({ error: "Debes configurar tu empresa primero" });
    const { waId } = req.params;
    const id = canonicalWaId(waId);
    const aliases = waIdAliases(id);
    const limit = Math.min(Number(req.query.limit) || 80, 200);
    const beforeRaw = req.query.before;
    const before = beforeRaw ? new Date(String(beforeRaw)) : void 0;
    const q = {
      companyId: req.auth.companyId,
      waId: { $in: aliases }
    };
    if (before && !Number.isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }
    const messages = await Message.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(
      messages.reverse().map((m) => {
        const tpl = outTemplateInboxFromPayload(m);
        return {
          fileName: typeof m.payload === "object" && m.payload ? m.payload.document?.filename : void 0,
          mimeType: typeof m.payload === "object" && m.payload ? m.payload.image?.mime_type ?? m.payload.video?.mime_type ?? m.payload.document?.mime_type ?? m.payload.audio?.mime_type : void 0,
          mediaId: typeof m.payload === "object" && m.payload ? m.payload.image?.id ?? m.payload.video?.id ?? m.payload.document?.id ?? m.payload.audio?.id : void 0,
          wamid: m.wamid,
          direction: m.direction,
          type: m.type,
          bodyText: m.bodyText,
          preview: m.bodyText ?? (typeof m.payload === "object" && m.payload && "caption" in m.payload ? String(m.payload.caption) : void 0),
          timestamp: m.timestamp ?? m.createdAt,
          createdAt: m.createdAt,
          deliveryStatus: m.deliveryStatus ?? void 0,
          deliveryErrors: m.deliveryErrors ?? void 0,
          deliveryUpdatedAt: m.deliveryUpdatedAt ?? void 0,
          ...tpl
        };
      })
    );
  });
  return r;
}
export {
  createInboxRouter
};
