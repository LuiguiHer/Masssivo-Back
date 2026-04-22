import { Router } from "express";
import { Chat } from "../models/Chat.js";
import { Client } from "../models/Client.js";
import { Message } from "../models/Message.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { canonicalWaId, waIdAliases, waIdGroupKey } from "../services/waId.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

type LeanMsg = {
  wamid: string;
  bodyText?: string;
  type?: string;
  direction: string;
  createdAt: Date;
  payload?: unknown;
  timestamp: Date;
  deliveryStatus?: string;
  deliveryErrors?: unknown;
  deliveryUpdatedAt?: Date;
};

/**
 * Inbox: cabecera de plantilla (imagen) y pie, guardados al enviar o parseados
 * de `payload.template.components` (mensajes antiguos).
 */
function outTemplateInboxFromPayload(
  m: LeanMsg,
): {
  templateHeaderImageUrl?: string;
  templateHeaderImageMediaId?: string;
  templateFooterText?: string;
} {
  const p = m.payload;
  if (m.type !== "template" || typeof p !== "object" || p === null) {
    return {};
  }
  const pl = p as Record<string, unknown>;
  const direct = pl.inboxTemplateDisplay;
  if (direct && typeof direct === "object" && direct !== null) {
    const d = direct as Record<string, unknown>;
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
  const t = tpl as { components?: unknown[] };
  const comps = Array.isArray(t.components) ? t.components : [];
  const out: {
    templateHeaderImageUrl?: string;
    templateHeaderImageMediaId?: string;
  } = {};
  for (const c of comps) {
    if (!c || typeof c !== "object") continue;
    const comp = c as { type?: string; parameters?: unknown[] };
    if (String(comp.type ?? "").toLowerCase() !== "header") continue;
    for (const param of comp.parameters ?? []) {
      if (!param || typeof param !== "object") continue;
      const pr = param as { type?: string; image?: { link?: string; id?: string } };
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

export function createInboxRouter(jwtSecret: string) {
  const r = Router();
  const auth = requireAuth(jwtSecret);
  r.get("/chats", auth, async (req: AuthedRequest, res) => {
    if (!req.auth?.companyId) return res.status(403).json({ error: "Debes configurar tu empresa primero" });
    const chats = await Chat.find({ companyId: req.auth.companyId }).sort({ lastMessageAt: -1 }).lean();
    const clients = await Client.find({ companyId: req.auth.companyId }).select({ name: 1, phone: 1 }).lean();
    const clientNameByWaId = new Map<string, string>();
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
    const grouped = new Map<string, { latest: (typeof chats)[0]; unreadCount: number }>();
    for (const c of chats) {
      const key = waIdGroupKey(c.waId);
      const prev = grouped.get(key);
      if (!prev) {
        grouped.set(key, { latest: c, unreadCount: Math.max(0, Number(c.unreadCount ?? 0)) });
        continue;
      }
      const latest =
        new Date(c.lastMessageAt).getTime() > new Date(prev.latest.lastMessageAt).getTime() ? c : prev.latest;
      grouped.set(key, {
        latest,
        unreadCount: prev.unreadCount + Math.max(0, Number(c.unreadCount ?? 0)),
      });
    }
    res.json(
      [...grouped.values()]
        .sort(
          (a, b) => new Date(b.latest.lastMessageAt).getTime() - new Date(a.latest.lastMessageAt).getTime(),
        )
        .map((g) => ({
          waId: canonicalWaId(g.latest.waId),
          displayName:
            clientNameByWaId.get(canonicalWaId(g.latest.waId)) ??
            clientNameByWaId.get(waIdGroupKey(g.latest.waId)) ??
            g.latest.displayName ??
            g.latest.waId,
          lastMessagePreview: g.latest.lastMessagePreview,
          lastMessageAt: g.latest.lastMessageAt,
          unreadCount: g.unreadCount,
        })),
    );
  });
  r.post("/chats/:waId/read", auth, async (req: AuthedRequest, res) => {
    if (!req.auth?.companyId) return res.status(403).json({ error: "Debes configurar tu empresa primero" });
    const id = canonicalWaId(req.params.waId);
    if (!id) return res.status(400).json({ error: "waId inválido" });
    const aliases = waIdAliases(id);
    await Chat.updateMany(
      { companyId: req.auth.companyId, waId: { $in: aliases } },
      { $set: { unreadCount: 0 } },
    );
    return res.json({ ok: true });
  });
  r.get("/chats/:waId/messages", auth, async (req: AuthedRequest, res) => {
    if (!req.auth?.companyId) return res.status(403).json({ error: "Debes configurar tu empresa primero" });
    const { waId } = req.params;
    const id = canonicalWaId(waId);
    const aliases = waIdAliases(id);
    const limit = Math.min(Number(req.query.limit) || 80, 200);
    const beforeRaw = req.query.before;
    const before = beforeRaw ? new Date(String(beforeRaw)) : undefined;
    const q: Record<string, unknown> = {
      companyId: req.auth.companyId,
      waId: { $in: aliases },
    };
    if (before && !Number.isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }
    const messages = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<LeanMsg[]>();
    res.json(
      messages.reverse().map((m) => {
        const tpl = outTemplateInboxFromPayload(m);
        return {
          fileName:
            typeof m.payload === "object" && m.payload
              ? (m.payload as { document?: { filename?: string } }).document?.filename
              : undefined,
          mimeType:
            typeof m.payload === "object" && m.payload
              ? (m.payload as { image?: { mime_type?: string } }).image?.mime_type ??
                (m.payload as { video?: { mime_type?: string } }).video?.mime_type ??
                (m.payload as { document?: { mime_type?: string } }).document?.mime_type ??
                (m.payload as { audio?: { mime_type?: string } }).audio?.mime_type
              : undefined,
          mediaId:
            typeof m.payload === "object" && m.payload
              ? (m.payload as { image?: { id?: string } }).image?.id ??
                (m.payload as { video?: { id?: string } }).video?.id ??
                (m.payload as { document?: { id?: string } }).document?.id ??
                (m.payload as { audio?: { id?: string } }).audio?.id
              : undefined,
          wamid: m.wamid,
          direction: m.direction,
          type: m.type,
          bodyText: m.bodyText,
          preview:
            m.bodyText ??
            (typeof m.payload === "object" && m.payload && "caption" in (m.payload as object)
              ? String((m.payload as { caption?: string }).caption)
              : undefined),
          timestamp: m.timestamp ?? m.createdAt,
          createdAt: m.createdAt,
          deliveryStatus: m.deliveryStatus ?? undefined,
          deliveryErrors: m.deliveryErrors ?? undefined,
          deliveryUpdatedAt: m.deliveryUpdatedAt ?? undefined,
          ...tpl,
        };
      }),
    );
  });
  return r;
}
