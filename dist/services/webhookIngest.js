import { Chat } from "../models/Chat.js";
import { Client } from "../models/Client.js";
import { CompanyWhatsappConfig } from "../models/CompanyWhatsappConfig.js";
import { CompanyWebhookVerifyToken } from "../models/CompanyWebhookVerifyToken.js";
import { Message } from "../models/Message.js";
import { syncMassCampaignRowFromWebhook } from "./massCampaignDelivery.js";
import { canonicalWaId, waIdAliases } from "./waId.js";
import { takeLiveTestIfActive } from "./webhookTestSession.js";
function previewFromMessage(m) {
  const t = m.type ?? "unknown";
  if (t === "text" && m.text?.body) return m.text.body;
  if (m.image?.caption) return m.image.caption;
  if (m.video?.caption) return m.video.caption;
  if (t === "image") return "[Imagen]";
  if (t === "video") return "[Video]";
  if (t === "audio") return "[Audio]";
  if (t === "document") return m.document?.filename ? `\u{1F4C4} ${m.document.filename}` : "[Documento]";
  if (t === "sticker") return "[Sticker]";
  if (t === "location") return "[Ubicaci\xF3n]";
  if (t === "contacts") return "[Contacto]";
  if (t === "button" && m.button?.text) return m.button.text;
  if (t === "interactive") return "[Interactivo]";
  return `[${t}]`;
}
function extractProfileName(value, waId) {
  const c = value.contacts?.find((x) => x.wa_id === waId || x.wa_id === waId.replace(/\D/g, ""));
  return c?.profile?.name;
}
async function ingestDeliveryStatuses(statuses, companyId, companyRoom, io) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const st of statuses) {
    const wamid = String(st.id ?? "").trim();
    if (!wamid) continue;
    const recipientId = canonicalWaId(String(st.recipient_id ?? ""));
    const tsSec = Number(st.timestamp);
    const ts = Number.isFinite(tsSec) ? new Date(tsSec * 1e3) : /* @__PURE__ */ new Date();
    const status = String(st.status ?? "");
    const payload = {
      deliveryStatus: status,
      deliveryErrors: st.errors ?? null,
      deliveryUpdatedAt: ts
    };
    let applied = await Message.updateOne({ companyId, wamid }, { $set: payload });
    if (applied.matchedCount === 0) {
      const row = await Message.findOne({ wamid }).select({ companyId: 1 }).lean();
      if (row && String(row.companyId) === String(companyId)) {
        applied = await Message.updateOne({ _id: row._id }, { $set: payload });
      } else if (row && String(row.companyId) !== String(companyId)) {
        console.warn(
          "[whatsapp/webhook] delivery status: wamid en otra empresa, se ignora",
          JSON.stringify({ wamid, expectedCompanyId: String(companyId), docCompanyId: String(row.companyId) })
        );
      } else {
        await sleep(400);
        applied = await Message.updateOne({ companyId, wamid }, { $set: payload });
        if (applied.matchedCount === 0) {
          await sleep(1200);
          applied = await Message.updateOne({ companyId, wamid }, { $set: payload });
        }
        if (applied.matchedCount === 0) {
          console.warn(
            "[whatsapp/webhook] delivery status: no se pudo guardar en Message (¿llegó antes que el insert del envío?)",
            JSON.stringify({ companyId: String(companyId), wamid, status })
          );
        }
      }
    }
    const logBase = {
      companyId: String(companyId),
      wamid,
      status,
      recipientId,
      errors: st.errors ?? null
    };
    const isFailed = status === "failed" || Array.isArray(st.errors) && st.errors.length > 0;
    if (isFailed) {
      console.warn("[whatsapp/webhook] delivery FAILED", JSON.stringify(logBase));
    } else {
      console.info("[whatsapp/webhook] message status", JSON.stringify(logBase));
    }
    io?.to(companyRoom).emit("message:delivery", {
      waId: recipientId,
      wamid,
      status,
      errors: st.errors ?? null,
      timestamp: ts.toISOString()
    });
    try {
      await syncMassCampaignRowFromWebhook(companyId, wamid, status, st.errors ?? null, ts);
    } catch (e) {
      console.warn("[whatsapp/webhook] mass campaign row sync failed", String(e));
    }
  }
}
async function ingestWhatsAppWebhook(body, io) {
  if (!body || typeof body !== "object") return;
  const root = body;
  if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return;
  for (const entry of root.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const value = change.value;
      const msgs = value.messages;
      const statuses = value.statuses;
      const hasMsgs = Array.isArray(msgs) && msgs.length > 0;
      const hasStatuses = Array.isArray(statuses) && statuses.length > 0;
      if (!hasMsgs && !hasStatuses) continue;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
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
          if (!from || !m.id) continue;
          const tsSec = Number(m.timestamp);
          const timestamp = Number.isFinite(tsSec) ? new Date(tsSec * 1e3) : /* @__PURE__ */ new Date();
          const bodyText = m.type === "text" ? m.text?.body : void 0;
          const preview = previewFromMessage(m);
          const displayName = extractProfileName(value, m.from ?? "") ?? extractProfileName(value, from);
          const client = await Client.findOne({ companyId, phone: { $in: waIdAliases(from) } }).select({ name: 1 }).lean();
          const preferredDisplayName = String(client?.name ?? "").trim() || displayName;
          const messageUpsert = await Message.updateOne(
            { companyId, wamid: m.id },
            {
              $setOnInsert: {
                companyId,
                waId: from,
                wamid: m.id,
                direction: "in",
                type: m.type ?? "unknown",
                bodyText,
                payload: m,
                timestamp
              }
            },
            { upsert: true }
          );
          const isNewMessage = Boolean(messageUpsert.upsertedCount);
          if (!isNewMessage) continue;
          await Chat.findOneAndUpdate(
            { companyId, waId: from },
            {
              $set: {
                lastMessageAt: timestamp,
                lastMessagePreview: preview,
                ...preferredDisplayName ? { displayName: preferredDisplayName } : {}
              },
              $inc: { unreadCount: 1 },
              $setOnInsert: { companyId, waId: from }
            },
            { upsert: true }
          );
          io?.to(companyRoom).emit("message:new", {
            waId: from,
            message: {
              wamid: m.id,
              direction: "in",
              type: m.type ?? "unknown",
              bodyText,
              preview,
              timestamp: timestamp.toISOString()
            }
          });
          io?.to(companyRoom).emit("chat:updated", {
            waId: from,
            displayName: preferredDisplayName,
            lastMessagePreview: preview,
            lastMessageAt: timestamp.toISOString(),
            unreadCountDelta: 1
          });
          if (takeLiveTestIfActive(String(companyId))) {
            const now = /* @__PURE__ */ new Date();
            await CompanyWebhookVerifyToken.updateOne({ companyId }, { $set: { liveTestPassedAt: now } });
            io?.to(companyRoom).emit("webhook:live-test:success", {
              ok: true,
              message: "Tu conexi\xF3n al webhook de Meta se estableci\xF3 correctamente.",
              passedAt: now.toISOString()
            });
          }
        }
      }
      if (hasStatuses && statuses) {
        await ingestDeliveryStatuses(statuses, companyId, companyRoom, io);
      }
    }
  }
}
export {
  ingestWhatsAppWebhook
};
