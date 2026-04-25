import { MongoServerError } from "mongodb";
import { Router } from "express";
import crypto from "node:crypto";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import multer from "multer";
import { isValidObjectId, Types } from "mongoose";
import { Chat } from "../models/Chat.js";
import { Client } from "../models/Client.js";
import { Company } from "../models/Company.js";
import { CompanyWebhookVerifyToken } from "../models/CompanyWebhookVerifyToken.js";
import { CompanyWhatsappConfig } from "../models/CompanyWhatsappConfig.js";
import { Message } from "../models/Message.js";
import { MassCampaign } from "../models/MassCampaign.js";
import { QrMessageTemplate } from "../models/QrMessageTemplate.js";
import { OtpChallenge } from "../models/OtpChallenge.js";
import { User } from "../models/User.js";
import { UploadedMedia } from "../models/UploadedMedia.js";
import { TemplateSampleUpload } from "../models/TemplateSampleUpload.js";
import { buildOtpAccessCaption, buildOtpRegisterCaption, generateNumericOtp6, hashOtpCode, normalizeDigits, postSerwpSendOtpWithImage, } from "../services/serwpSend.js";
import { computeDeliveryStatsFromRows, mergeIncomingRowResultsWithExisting, } from "../services/massCampaignDelivery.js";
import { canonicalWaId } from "../services/waId.js";
import { cancelLiveTest, startLiveTest } from "../services/webhookTestSession.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { config } from "../config.js";
import { queueLandingNotifyToWhatsApp } from "../services/landingNotifyWhatsApp.js";
import { assertMetaStyleConsecutiveTemplateVarsInText } from "../services/qrTemplateVars.js";
import { deleteObjectFromMediaService, uploadFileToMediaService } from "../services/mediaServiceClient.js";
async function deliverOtpCode(deps, whatsappDigits, code, mode) {
    const caption = mode === "login" ? buildOtpAccessCaption(code) : buildOtpRegisterCaption(code);
    await postSerwpSendOtpWithImage(deps.serwpSendUrl, whatsappDigits, caption);
}
/** ID de app Meta para uploads resumibles; opcional por empresa o META_APP_ID en entorno. */
function resolveMetaAppId(cfg) {
    const fromCfg = String(cfg.waMetaAppId ?? "").trim();
    if (fromCfg)
        return fromCfg;
    return String(process.env.META_APP_ID ?? process.env.WHATSAPP_META_APP_ID ?? "").trim();
}
/** Tipos MIME admitidos por Graph Resumable Upload para plantillas (Meta). */
function metaResumableFileType(mimetype, originalname) {
    const m = (mimetype || "").toLowerCase();
    const ext = (originalname.includes(".") ? originalname.split(".").pop() ?? "" : "").toLowerCase();
    if (m === "image/jpeg" || m === "image/jpg" || ext === "jpg" || ext === "jpeg")
        return "image/jpeg";
    if (m === "image/png" || ext === "png")
        return "image/png";
    if (m === "video/mp4" || ext === "mp4")
        return "video/mp4";
    if (m === "application/pdf" || ext === "pdf")
        return "application/pdf";
    return null;
}
function buildInboxTemplateDisplay(components, footerText) {
    const out = {};
    const ft = footerText.trim();
    if (ft)
        out.footerText = ft;
    if (Array.isArray(components)) {
        for (const c of components) {
            if (!c || typeof c !== "object")
                continue;
            const comp = c;
            if (String(comp.type ?? "").toLowerCase() !== "header")
                continue;
            const params = Array.isArray(comp.parameters) ? comp.parameters : [];
            for (const p of params) {
                if (!p || typeof p !== "object")
                    continue;
                const param = p;
                if (param.type === "image" && param.image && typeof param.image === "object") {
                    const link = typeof param.image.link === "string" ? param.image.link.trim() : "";
                    const id = typeof param.image.id === "string" ? param.image.id.trim() : "";
                    if (link)
                        out.headerImageUrl = link;
                    if (id)
                        out.headerImageMediaId = id;
                }
            }
        }
    }
    return Object.keys(out).length ? out : undefined;
}
async function getCompanyWhatsappConfigByAuthUser(userId) {
    const u = await User.findById(userId).lean();
    if (!u)
        return { error: { code: 404, message: "Usuario no encontrado" } };
    if (!u.companyId)
        return { error: { code: 400, message: "Debes crear empresa primero" } };
    const cfg = await CompanyWhatsappConfig.findOne({ companyId: u.companyId }).lean();
    if (!cfg)
        return { error: { code: 404, message: "No existe configuración WhatsApp para esta empresa" } };
    return { cfg };
}
async function fetchMetaTemplateById(cfg, templateId) {
    const fields = "id,name,status,category,language,components,parameter_format,sub_category";
    const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(templateId)}?fields=${encodeURIComponent(fields)}`;
    const rMeta = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${cfg.waAccessToken}` } });
    const text = await rMeta.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    }
    catch {
        data = { raw: text };
    }
    if (!rMeta.ok)
        return { ok: false, status: rMeta.status, data };
    return { ok: true, data };
}
function signToken(deps, userId, companyId) {
    return jwt.sign(companyId ? { companyId } : {}, deps.jwtSecret, { subject: userId, expiresIn: "7d" });
}
async function createOtp(purpose, whatsappDigits, registerDraft) {
    await OtpChallenge.deleteMany({ purpose, whatsapp: whatsappDigits, consumedAt: { $exists: false } });
    const code = generateNumericOtp6();
    const codeHash = hashOtpCode(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OtpChallenge.create({
        purpose,
        whatsapp: whatsappDigits,
        codeHash,
        attemptsLeft: 3,
        expiresAt,
        ...(registerDraft ? { registerDraft } : {}),
    });
    return { code, expiresAt };
}
async function verifyOtp(purpose, whatsappDigits, code) {
    const now = new Date();
    const challenge = await OtpChallenge.findOne({
        purpose,
        whatsapp: whatsappDigits,
        consumedAt: { $exists: false },
        expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
    if (!challenge)
        return { ok: false, error: "Código inválido o expirado" };
    if (challenge.attemptsLeft <= 0)
        return { ok: false, error: "Sin intentos disponibles" };
    const okCode = challenge.codeHash === hashOtpCode(code);
    if (!okCode) {
        challenge.attemptsLeft -= 1;
        await challenge.save();
        return { ok: false, error: "Código incorrecto", attemptsLeft: challenge.attemptsLeft };
    }
    challenge.consumedAt = new Date();
    await challenge.save();
    return { ok: true, challenge };
}
/** Base pública `https://host/api/send` para URLs de muestra (variable PUBLIC_TEMPLATE_SAMPLE_BASE_URL opcional). */
function inferPublicSendApiBase(req) {
    const fixed = process.env.PUBLIC_TEMPLATE_SAMPLE_BASE_URL?.trim().replace(/\/$/, "");
    if (fixed)
        return fixed;
    const xfProtoRaw = req.headers["x-forwarded-proto"];
    const xfProto = typeof xfProtoRaw === "string" ? xfProtoRaw.split(",")[0].trim() : "";
    const inferredHttps = Boolean(req.secure) || req.protocol === "https";
    const proto = xfProto ? xfProto.split("/")[0] : inferredHttps ? "https" : "http";
    const xfHostRaw = req.headers["x-forwarded-host"];
    const host = (typeof xfHostRaw === "string" ? xfHostRaw.split(",")[0].trim() : "") || req.get("host") || "localhost";
    return `${proto}://${host}/api/send`;
}
function resolveOutboundChannel(company) {
    if (company && company.outboundChannel === "qr_baileys")
        return "qr_baileys";
    return "cloud_api";
}
export function createSendApiRouter(deps) {
    const r = Router();
    const auth = requireAuth(deps.jwtSecret);
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
    const qrTemplateDisk = multer({
        storage: multer.diskStorage({
            destination: (_req, _f, cb) => cb(null, os.tmpdir()),
            filename: (_req, f, cb) => cb(null, `qrtpl-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(f.originalname) || ""}`),
        }),
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (_r, f, cb) => {
            const m = (f.mimetype || "").toLowerCase();
            if (["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"].includes(m))
                return cb(null, true);
            cb(new Error("Solo se admiten imágenes JPEG, PNG, GIF o WebP"));
        },
    });
    const isQrStorageEnabled = () => Boolean(deps.mediaServiceKey && deps.mediaPublicBaseUrl && deps.mediaServiceUrl);
    const enrichQr = (raw) => {
        if (!raw)
            return raw;
        const o = { ...raw };
        const base = String(deps.mediaPublicBaseUrl ?? "").replace(/\/$/, "");
        const k = String(o.imageObjectKey ?? "").trim();
        if (k && base) {
            o.imageUrl = `${base}/${k.split("/").map(encodeURIComponent).join("/")}`;
        }
        else {
            const u0 = String(o.imageUrl ?? "").trim();
            if (u0 && base && /127\.0\.0\.1:9000|localhost:9000/.test(u0)) {
                const origin = base.match(/^(https?:\/\/[^/]+)/)?.[1];
                if (origin) {
                    try {
                        o.imageUrl = origin + new URL(u0).pathname;
                    }
                    catch {
                        o.imageUrl = u0;
                    }
                }
                else
                    o.imageUrl = u0;
            }
            else
                o.imageUrl = u0;
            if (!String(o.imageUrl ?? "").trim())
                o.imageUrl = "";
        }
        return o;
    };
    const maybeQrTemplateMultipart = (req, res, next) => {
        const ct = String(req.headers["content-type"] || "").toLowerCase();
        if (ct.includes("multipart/form-data")) {
            return qrTemplateDisk.single("image")(req, res, (err) => {
                if (err) {
                    return res.status(400).json({ error: err.message || "Solicitud multipart no válida" });
                }
                return next();
            });
        }
        return next();
    };
    const qrBase = deps.masssivoQrWaBaseUrl?.replace(/\/$/, "");
    const qrKey = deps.masssivoQrWaKey;
    const forwardMasssivoQr = (companyId, subPath, init) => {
        const url = `${qrBase}/v1/tenants/${encodeURIComponent(companyId)}${subPath}`;
        const h = { "X-Internal-Key": qrKey };
        if (init.body != null)
            h["Content-Type"] = "application/json";
        return fetch(url, { method: init.method ?? "GET", body: init.body, headers: h });
    };
    /** Sin auth: Meta y otros clientes deben poder GET por HTTPS el archivo de muestra. */
    r.get("/public/template-sample/:token", async (req, res) => {
        const token = String(req.params.token ?? "").trim();
        if (!token)
            return res.status(400).send("Bad request");
        const doc = await TemplateSampleUpload.findOne({ token }).lean();
        if (!doc?.data?.length)
            return res.status(404).send("Not found");
        res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(Buffer.from(doc.data));
    });
    /** Formulario de contacto de la landing (sin JWT). Honeypot: campo `_hp` debe ir vacío. */
    r.post("/public/landing-contact", async (req, res) => {
        try {
            const b = req.body ?? {};
            if (String(b._hp ?? "").trim()) {
                return res.json({ ok: true });
            }
            const name = String(b.name ?? "").trim();
            const company = String(b.company ?? "").trim();
            const phone = String(b.phone ?? "").trim();
            const need = String(b.need ?? "").trim();
            const message = String(b.message ?? "").trim();
            if (!name || !company || !phone || !need) {
                return res.status(400).json({ error: "Faltan campos obligatorios" });
            }
            if (name.length > 200 || company.length > 200 || phone.length > 50 || need.length > 500 || message.length > 8000) {
                return res.status(400).json({ error: "Texto no válido" });
            }
            queueLandingNotifyToWhatsApp(deps.serwpSendUrl, config.numberListWhats, { name, company, phone, need, message });
            return res.json({ ok: true });
        }
        catch (e) {
            console.error("[public/landing-contact]", e);
            return res.status(500).json({ error: "No se pudo registrar la solicitud. Intenta de nuevo o escríbenos por WhatsApp." });
        }
    });
    /** Sube la muestra a MongoDB y devuelve una URL HTTPS pública para `header_handle` (evita fallos de la API resumible de Meta). */
    r.post("/media/template-sample-hosted", auth, upload.single("file"), async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u?.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "file es obligatorio" });
        const token = crypto.randomUUID();
        await TemplateSampleUpload.create({
            token,
            companyId: u.companyId,
            mimeType: file.mimetype || "application/octet-stream",
            originalName: file.originalname || "",
            data: file.buffer,
        });
        const base = inferPublicSendApiBase(req);
        const handle = `${base}/public/template-sample/${token}`;
        return res.json({ handle });
    });
    r.post("/auth/register/request-otp", async (req, res) => {
        try {
            const b = req.body ?? {};
            const user = {
                name: String(b.user?.name ?? "").trim(),
                email: String(b.user?.email ?? "").trim().toLowerCase(),
                whatsapp: normalizeDigits(b.user?.whatsapp ?? ""),
            };
            if (!user.name || !user.email || !user.whatsapp)
                return res.status(400).json({ error: "Usuario incompleto" });
            const dupUser = await User.findOne({ $or: [{ email: user.email }, { whatsapp: user.whatsapp }] }).lean();
            if (dupUser)
                return res.status(409).json({ error: "Ya existe un usuario con ese email o WhatsApp" });
            const { code } = await createOtp("register", user.whatsapp, { user });
            await deliverOtpCode(deps, user.whatsapp, code, "register");
            return res.json({ ok: true, expiresInSec: 300, attempts: 3 });
        }
        catch (e) {
            console.error("[send/register/request-otp]", e);
            return res.status(500).json({ error: "No se pudo enviar el código" });
        }
    });
    r.post("/auth/register/verify", async (req, res) => {
        try {
            const b = req.body ?? {};
            const whatsapp = normalizeDigits(b.user?.whatsapp ?? "");
            const code = String(b.code ?? "").replace(/\D/g, "");
            if (!whatsapp || code.length !== 6)
                return res.status(400).json({ error: "Datos inválidos" });
            const v = await verifyOtp("register", whatsapp, code);
            if (!v.ok)
                return res.status(400).json({ error: v.error, attemptsLeft: "attemptsLeft" in v ? v.attemptsLeft : undefined });
            const draft = v.challenge.registerDraft;
            if (!draft?.user)
                return res.status(400).json({ error: "Sesión de registro inválida" });
            const userDoc = await User.create({
                name: draft.user.name,
                email: draft.user.email,
                whatsapp: draft.user.whatsapp,
                role: "owner",
                status: "active",
            });
            const tokenOut = signToken(deps, String(userDoc._id));
            const userOut = { id: userDoc._id, name: userDoc.name, email: userDoc.email, whatsapp: userDoc.whatsapp };
            return res.json({ token: tokenOut, user: userOut, company: null });
        }
        catch (e) {
            console.error("[send/register/verify]", e);
            return res.status(500).json({ error: "No se pudo completar el registro" });
        }
    });
    r.post("/auth/login/request-otp", async (req, res) => {
        try {
            const whatsapp = normalizeDigits(req.body?.whatsapp ?? "");
            if (!whatsapp)
                return res.status(400).json({ error: "WhatsApp inválido" });
            const u = await User.findOne({ whatsapp }).lean();
            if (!u)
                return res.status(404).json({ error: "Usuario no encontrado" });
            if (u.status !== "active")
                return res.status(403).json({ error: "Usuario deshabilitado" });
            const { code } = await createOtp("login", whatsapp);
            await deliverOtpCode(deps, whatsapp, code, "login");
            return res.json({ ok: true, expiresInSec: 300, attempts: 3 });
        }
        catch (e) {
            console.error("[send/login/request-otp]", e);
            return res.status(500).json({ error: "No se pudo enviar el código" });
        }
    });
    r.post("/auth/login/verify", async (req, res) => {
        try {
            const whatsapp = normalizeDigits(req.body?.whatsapp ?? "");
            const code = String(req.body?.code ?? "").replace(/\D/g, "");
            if (!whatsapp || code.length !== 6)
                return res.status(400).json({ error: "Datos inválidos" });
            const u = await User.findOne({ whatsapp }).lean();
            if (!u)
                return res.status(404).json({ error: "Usuario no encontrado" });
            if (u.status !== "active")
                return res.status(403).json({ error: "Usuario deshabilitado" });
            const v = await verifyOtp("login", whatsapp, code);
            if (!v.ok)
                return res.status(400).json({ error: v.error, attemptsLeft: "attemptsLeft" in v ? v.attemptsLeft : undefined });
            const token = signToken(deps, String(u._id), u.companyId ? String(u.companyId) : undefined);
            return res.json({
                token,
                user: { id: u._id, name: u.name, email: u.email, whatsapp: u.whatsapp },
                company: u.companyId ? { id: u.companyId } : null,
            });
        }
        catch (e) {
            console.error("[send/login/verify]", e);
            return res.status(500).json({ error: "No se pudo iniciar sesión" });
        }
    });
    r.get("/auth/me", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.json({ user: { id: u._id, name: u.name, email: u.email, whatsapp: u.whatsapp }, company: null, whatsappConfig: null, webhook: null });
        const c = await Company.findById(u.companyId).lean();
        if (!c)
            return res.json({ user: { id: u._id, name: u.name, email: u.email, whatsapp: u.whatsapp }, company: null, whatsappConfig: null, webhook: null });
        const wc = await CompanyWhatsappConfig.findOne({ companyId: c._id }).lean();
        const webhook = await CompanyWebhookVerifyToken.findOne({ companyId: c._id }).lean();
        return res.json({
            user: { id: u._id, name: u.name, email: u.email, whatsapp: u.whatsapp },
            company: {
                id: c._id,
                nit: c.nit,
                email: c.email,
                legalName: c.legalName,
                phone: c.phone,
                outboundChannel: resolveOutboundChannel(c),
            },
            whatsappConfig: wc
                ? {
                    id: wc._id,
                    companyId: wc.companyId,
                    graphApiVersion: wc.graphApiVersion,
                    waPhoneNumberId: wc.waPhoneNumberId,
                    waMetaAppId: wc.waMetaAppId,
                    waWabaId: wc.waWabaId,
                    waBusinessId: wc.waBusinessId,
                    waAccessToken: wc.waAccessToken,
                    messageStartTemplate: wc.messageStartTemplate ?? null,
                }
                : null,
            webhook: webhook
                ? {
                    id: webhook._id,
                    verifyToken: webhook.token,
                    connected: Boolean(webhook.verifiedAt),
                    verifiedAt: webhook.verifiedAt,
                    liveTestPassedAt: webhook.liveTestPassedAt,
                    connectionVerified: Boolean(webhook.liveTestPassedAt),
                }
                : null,
        });
    });
    r.post("/company", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId);
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (u.companyId)
            return res.status(409).json({ error: "Este usuario ya tiene empresa asociada" });
        const b = req.body ?? {};
        const company = {
            nit: String(b.nit ?? "").trim(),
            email: String(b.email ?? "").trim().toLowerCase(),
            legalName: String(b.legalName ?? "").trim(),
            phone: normalizeDigits(b.phone ?? ""),
        };
        if (!company.nit || !company.email || !company.legalName || !company.phone) {
            return res.status(400).json({ error: "Datos de empresa incompletos" });
        }
        const dupCompanyNit = await Company.findOne({ nit: company.nit }).lean();
        if (dupCompanyNit)
            return res.status(409).json({ error: "Ya existe una empresa con ese NIT" });
        try {
            const companyDoc = await Company.create(company);
            u.companyId = companyDoc._id;
            await u.save();
            const token = signToken(deps, String(u._id), String(companyDoc._id));
            return res.status(201).json({ token, company: { id: companyDoc._id } });
        }
        catch (e) {
            if (e instanceof MongoServerError && e.code === 11000) {
                const key = e.keyPattern ? Object.keys(e.keyPattern)[0] : "";
                console.error("[POST /company] duplicate key", e.keyValue);
                const msg = key === "nit"
                    ? "Ya existe una empresa con ese NIT"
                    : "No se pudo crear la empresa: conflicto de datos (índice único). Contacta soporte.";
                return res.status(409).json({ error: msg });
            }
            throw e;
        }
    });
    r.put("/company", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId);
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(404).json({ error: "No tienes empresa configurada" });
        const current = await Company.findById(u.companyId);
        if (!current)
            return res.status(404).json({ error: "Empresa no encontrada" });
        const b = req.body ?? {};
        const next = {
            nit: String(b.nit ?? current.nit).trim(),
            email: String(b.email ?? current.email).trim().toLowerCase(),
            legalName: String(b.legalName ?? current.legalName).trim(),
            phone: normalizeDigits(b.phone ?? current.phone),
        };
        if (!next.nit || !next.email || !next.legalName || !next.phone) {
            return res.status(400).json({ error: "Datos de empresa incompletos" });
        }
        const dupCompanyNit = await Company.findOne({ nit: next.nit, _id: { $ne: current._id } }).lean();
        if (dupCompanyNit)
            return res.status(409).json({ error: "Ya existe una empresa con ese NIT" });
        current.nit = next.nit;
        current.email = next.email;
        current.legalName = next.legalName;
        current.phone = next.phone;
        await current.save();
        return res.json({
            company: {
                id: current._id,
                nit: current.nit,
                email: current.email,
                legalName: current.legalName,
                phone: current.phone,
                outboundChannel: resolveOutboundChannel(current),
            },
        });
    });
    r.patch("/company/messaging", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId);
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(404).json({ error: "No tienes empresa configurada" });
        const b = (req.body ?? {});
        if (b.outboundChannel !== "cloud_api" && b.outboundChannel !== "qr_baileys") {
            return res.status(400).json({ error: "outboundChannel debe ser cloud_api o qr_baileys" });
        }
        await Company.findByIdAndUpdate(u.companyId, { $set: { outboundChannel: b.outboundChannel } });
        return res.json({ ok: true, outboundChannel: b.outboundChannel });
    });
    r.delete("/company", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId);
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(404).json({ error: "No tienes empresa configurada" });
        const companyId = String(u.companyId);
        await CompanyWebhookVerifyToken.deleteOne({ companyId });
        await CompanyWhatsappConfig.deleteOne({ companyId });
        await Company.deleteOne({ _id: companyId });
        await User.updateMany({ companyId }, { $unset: { companyId: "" } });
        return res.json({ ok: true });
    });
    r.get("/company/whatsapp", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(404).json({ error: "No tienes empresa configurada" });
        const wc = await CompanyWhatsappConfig.findOne({ companyId: u.companyId }).lean();
        if (!wc)
            return res.json({ whatsappConfig: null });
        return res.json({
            whatsappConfig: {
                id: wc._id,
                companyId: wc.companyId,
                graphApiVersion: wc.graphApiVersion,
                waPhoneNumberId: wc.waPhoneNumberId,
                waMetaAppId: wc.waMetaAppId,
                waWabaId: wc.waWabaId,
                waBusinessId: wc.waBusinessId,
                waAccessToken: wc.waAccessToken,
            },
        });
    });
    r.post("/company/whatsapp", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const existing = await CompanyWhatsappConfig.findOne({ companyId: u.companyId }).lean();
        if (existing)
            return res.status(409).json({ error: "La empresa ya tiene configuración WhatsApp" });
        const b = req.body ?? {};
        const payload = {
            companyId: u.companyId,
            waAccessToken: String(b.waAccessToken ?? "").trim(),
            graphApiVersion: String(b.graphApiVersion ?? "").trim() || "v21.0",
            waPhoneNumberId: String(b.waPhoneNumberId ?? "").trim(),
            waMetaAppId: String(b.waMetaAppId ?? "").trim() || undefined,
            waWabaId: String(b.waWabaId ?? "").trim() || undefined,
            waBusinessId: String(b.waBusinessId ?? "").trim() || undefined,
        };
        if (!payload.waAccessToken || !payload.waPhoneNumberId) {
            return res.status(400).json({ error: "Credenciales WhatsApp incompletas" });
        }
        const dupPhoneId = await CompanyWhatsappConfig.findOne({ waPhoneNumberId: payload.waPhoneNumberId }).lean();
        if (dupPhoneId)
            return res.status(409).json({ error: "WA_PHONE_NUMBER_ID ya está registrado" });
        const wc = await CompanyWhatsappConfig.create(payload);
        return res.status(201).json({ whatsappConfig: wc });
    });
    r.get("/company/webhook", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(404).json({ error: "No tienes empresa configurada" });
        const wh = await CompanyWebhookVerifyToken.findOne({ companyId: u.companyId }).lean();
        if (!wh)
            return res.json({ webhook: null });
        return res.json({
            webhook: {
                id: wh._id,
                verifyToken: wh.token,
                connected: Boolean(wh.verifiedAt),
                verifiedAt: wh.verifiedAt,
                liveTestPassedAt: wh.liveTestPassedAt,
                connectionVerified: Boolean(wh.liveTestPassedAt),
            },
        });
    });
    r.post("/company/webhook/generate-verify-token", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const token = `meta_${crypto.randomBytes(18).toString("hex")}`;
        await CompanyWebhookVerifyToken.findOneAndUpdate({ companyId: u.companyId }, { $set: { token, verifiedAt: undefined }, $unset: { liveTestPassedAt: 1 } }, { upsert: true, new: true });
        return res.json({ verifyToken: token });
    });
    r.put("/company/webhook", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const verifyToken = String(req.body?.verifyToken ?? "").trim();
        if (!verifyToken)
            return res.status(400).json({ error: "verifyToken es obligatorio" });
        const dup = await CompanyWebhookVerifyToken.findOne({ token: verifyToken, companyId: { $ne: u.companyId } }).lean();
        if (dup)
            return res.status(409).json({ error: "El verify token ya está en uso" });
        const wh = await CompanyWebhookVerifyToken.findOneAndUpdate({ companyId: u.companyId }, { $set: { token: verifyToken, verifiedAt: undefined }, $unset: { liveTestPassedAt: 1 } }, { upsert: true, new: true }).lean();
        return res.json({
            webhook: {
                id: wh?._id,
                verifyToken: wh?.token,
                connected: Boolean(wh?.verifiedAt),
                verifiedAt: wh?.verifiedAt,
                liveTestPassedAt: wh?.liveTestPassedAt,
                connectionVerified: Boolean(wh?.liveTestPassedAt),
            },
        });
    });
    r.post("/company/webhook/start-live-test", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const wh = await CompanyWebhookVerifyToken.findOne({ companyId: u.companyId }).lean();
        if (!wh?.token?.trim()) {
            return res.status(400).json({ error: "Guarda primero el verify token en el servidor" });
        }
        startLiveTest(String(u.companyId));
        return res.json({ ok: true });
    });
    r.post("/company/webhook/cancel-live-test", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u?.companyId)
            return res.status(400).json({ error: "Sin empresa" });
        cancelLiveTest(String(u.companyId));
        return res.json({ ok: true });
    });
    r.put("/company/whatsapp", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const current = await CompanyWhatsappConfig.findOne({ companyId: u.companyId });
        if (!current)
            return res.status(404).json({ error: "No existe configuración WhatsApp para esta empresa" });
        const b = req.body ?? {};
        const next = {
            waAccessToken: String(b.waAccessToken ?? current.waAccessToken).trim(),
            graphApiVersion: String(b.graphApiVersion ?? current.graphApiVersion).trim() || "v21.0",
            waPhoneNumberId: String(b.waPhoneNumberId ?? current.waPhoneNumberId).trim(),
            waMetaAppId: String(b.waMetaAppId ?? current.waMetaAppId ?? "").trim() || undefined,
            waWabaId: String(b.waWabaId ?? current.waWabaId ?? "").trim() || undefined,
            waBusinessId: String(b.waBusinessId ?? current.waBusinessId ?? "").trim() || undefined,
        };
        if (!next.waAccessToken || !next.waPhoneNumberId) {
            return res.status(400).json({ error: "Credenciales WhatsApp incompletas" });
        }
        const dupPhoneId = await CompanyWhatsappConfig.findOne({ waPhoneNumberId: next.waPhoneNumberId, _id: { $ne: current._id } }).lean();
        if (dupPhoneId)
            return res.status(409).json({ error: "WA_PHONE_NUMBER_ID ya está registrado" });
        if (String(current.waPhoneNumberId) !== next.waPhoneNumberId) {
            cancelLiveTest(String(u.companyId));
            await CompanyWebhookVerifyToken.updateOne({ companyId: u.companyId }, { $unset: { liveTestPassedAt: 1 } });
        }
        current.waAccessToken = next.waAccessToken;
        current.graphApiVersion = next.graphApiVersion;
        current.waPhoneNumberId = next.waPhoneNumberId;
        current.waMetaAppId = next.waMetaAppId;
        current.waWabaId = next.waWabaId;
        current.waBusinessId = next.waBusinessId;
        await current.save();
        return res.json({ whatsappConfig: current });
    });
    r.delete("/company/whatsapp", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u)
            return res.status(404).json({ error: "Usuario no encontrado" });
        if (!u.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        await CompanyWhatsappConfig.deleteOne({ companyId: u.companyId });
        await CompanyWebhookVerifyToken.deleteOne({ companyId: u.companyId });
        return res.json({ ok: true });
    });
    r.get("/company/messages/start-template/options", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        if (!cfg.waWabaId)
            return res.status(400).json({ error: "Debes configurar WA_WABA_ID para consultar plantillas" });
        const url = new URL(`https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waWabaId)}/message_templates`);
        url.searchParams.set("limit", "250");
        const rMeta = await fetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${cfg.waAccessToken}` } });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta templates query failed", detail: data });
        const rows = Array.isArray(data?.data) ? (data.data ?? []) : [];
        const options = rows
            .map((x) => {
            const o = x;
            return {
                id: String(o.id ?? "").trim(),
                name: String(o.name ?? "").trim(),
                languageCode: String(o.language ?? "").trim(),
                status: String(o.status ?? "").trim(),
                category: String(o.category ?? "").trim(),
            };
        })
            .filter((x) => x.id && x.name && x.languageCode)
            .filter((x) => x.status.toUpperCase() === "APPROVED");
        return res.json({ data: options });
    });
    r.get("/company/messages/start-template", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const saved = (cfg.messageStartTemplate ?? {});
        const out = {
            templateLabel: String(saved.templateLabel ?? "inicio_conversacion"),
            metaTemplateId: String(saved.metaTemplateId ?? ""),
            templateName: String(saved.templateName ?? ""),
            languageCode: String(saved.languageCode ?? ""),
        };
        if (!out.metaTemplateId)
            return res.json({ config: out, detail: null });
        const meta = await fetchMetaTemplateById(cfg, out.metaTemplateId);
        if (!meta.ok)
            return res.json({ config: out, detail: null });
        return res.json({ config: out, detail: meta.data });
    });
    r.put("/company/messages/start-template", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const b = req.body ?? {};
        const metaTemplateId = String(b.metaTemplateId ?? "").trim();
        const templateName = String(b.templateName ?? "").trim();
        const languageCode = String(b.languageCode ?? "").trim();
        const templateLabel = "inicio_conversacion";
        if (!metaTemplateId || !templateName || !languageCode) {
            return res.status(400).json({ error: "metaTemplateId, templateName y languageCode son obligatorios" });
        }
        const meta = await fetchMetaTemplateById(cfg, metaTemplateId);
        if (!meta.ok)
            return res.status(meta.status).json({ error: "No se pudo validar la plantilla en Meta", detail: meta.data });
        await CompanyWhatsappConfig.updateOne({ _id: cfg._id }, {
            $set: {
                messageStartTemplate: {
                    templateLabel,
                    metaTemplateId,
                    templateName,
                    languageCode,
                },
            },
        });
        return res.json({ ok: true, config: { templateLabel, metaTemplateId, templateName, languageCode } });
    });
    r.get("/company/templates", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        if (!cfg.waWabaId)
            return res.status(400).json({ error: "Debes configurar WA_WABA_ID para consultar plantillas" });
        const url = new URL(`https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waWabaId)}/message_templates`);
        if (typeof req.query.name === "string" && req.query.name.trim())
            url.searchParams.set("name", req.query.name.trim());
        const rMeta = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${cfg.waAccessToken}` },
        });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta templates query failed", detail: data });
        return res.json(data);
    });
    r.get("/company/templates/:templateId", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const templateId = String(req.params.templateId ?? "").trim();
        if (!templateId)
            return res.status(400).json({ error: "templateId inválido" });
        const fields = "id,name,status,category,language,components,parameter_format,sub_category";
        const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(templateId)}?fields=${encodeURIComponent(fields)}`;
        const rMeta = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${cfg.waAccessToken}` } });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta template get failed", detail: data });
        return res.json(data);
    });
    r.post("/company/templates", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        if (!cfg.waWabaId)
            return res.status(400).json({ error: "Debes configurar WA_WABA_ID para crear plantillas" });
        const b = req.body ?? {};
        const name = String(b.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
        const language = String(b.language ?? "").trim();
        const category = String(b.category ?? "").trim().toUpperCase();
        const components = Array.isArray(b.components) ? b.components : null;
        if (!name || !language || !category || !components?.length) {
            return res.status(400).json({ error: "name, language, category y components (arreglo) son obligatorios" });
        }
        const payload = { name, language, category, components };
        if (typeof b.parameter_format === "string" && b.parameter_format.trim()) {
            payload.parameter_format = String(b.parameter_format).trim().toUpperCase();
        }
        if (typeof b.sub_category === "string" && b.sub_category.trim()) {
            payload.sub_category = String(b.sub_category).trim().toUpperCase();
        }
        if (typeof b.message_send_ttl_seconds === "number" && Number.isFinite(b.message_send_ttl_seconds)) {
            payload.message_send_ttl_seconds = b.message_send_ttl_seconds;
        }
        if (typeof b.allow_template_category_change === "boolean") {
            payload.allow_template_category_change = b.allow_template_category_change;
        }
        const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waWabaId)}/message_templates`;
        const rMeta = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.waAccessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta template create failed", detail: data });
        return res.status(rMeta.status === 201 ? 201 : 200).json(data);
    });
    r.post("/company/templates/:templateId", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const templateId = String(req.params.templateId ?? "").trim();
        if (!templateId)
            return res.status(400).json({ error: "templateId inválido" });
        const b = req.body ?? {};
        const patch = {};
        if (Array.isArray(b.components))
            patch.components = b.components;
        if (typeof b.category === "string" && b.category.trim())
            patch.category = String(b.category).trim().toUpperCase();
        if (typeof b.language === "string" && b.language.trim())
            patch.language = String(b.language).trim();
        if (typeof b.name === "string" && b.name.trim())
            patch.name = String(b.name).trim().toLowerCase().replace(/\s+/g, "_");
        if (typeof b.parameter_format === "string" && b.parameter_format.trim()) {
            patch.parameter_format = String(b.parameter_format).trim().toUpperCase();
        }
        if (typeof b.sub_category === "string" && b.sub_category.trim()) {
            patch.sub_category = String(b.sub_category).trim().toUpperCase();
        }
        if (Object.keys(patch).length === 0)
            return res.status(400).json({ error: "Envía al menos components, category, language o name para editar" });
        const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(templateId)}`;
        const rMeta = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.waAccessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(patch),
        });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta template edit failed", detail: data });
        return res.json(data);
    });
    r.delete("/company/templates", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        if (!cfg.waWabaId)
            return res.status(400).json({ error: "Debes configurar WA_WABA_ID para eliminar plantillas" });
        const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
        const hsmId = typeof req.query.hsm_id === "string" ? req.query.hsm_id.trim() : "";
        if (!name && !hsmId)
            return res.status(400).json({ error: "Indica name o hsm_id en query" });
        const url = new URL(`https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waWabaId)}/message_templates`);
        if (name)
            url.searchParams.set("name", name);
        if (hsmId)
            url.searchParams.set("hsm_id", hsmId);
        const rMeta = await fetch(url.toString(), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${cfg.waAccessToken}` },
        });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta template delete failed", detail: data });
        return res.json(data ?? { success: true });
    });
    r.post("/messages/template", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u0 = await User.findById(req.auth.userId).lean();
        if (!u0?.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const co0 = await Company.findById(u0.companyId).lean();
        if (resolveOutboundChannel(co0) === "qr_baileys") {
            return res.status(400).json({
                error: "Canal de salida: WhatsApp Web (QR). Las plantillas HSM requieren Cloud API. Cambiá el canal en Configuración o enviá solo texto.",
            });
        }
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const b = req.body ?? {};
        const to = canonicalWaId(normalizeDigits(b.to ?? ""));
        const name = String(b.templateName ?? "").trim();
        const languageCode = String(b.languageCode ?? "").trim();
        const components = Array.isArray(b.components) ? b.components : undefined;
        const previewText = String(b.previewText ?? "").trim();
        const footerText = String(b.footerText ?? "").trim();
        if (!to || !name || !languageCode) {
            return res.status(400).json({ error: "to, templateName y languageCode son obligatorios" });
        }
        const graphPayload = {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
                name,
                language: { code: languageCode },
                ...(components ? { components } : {}),
            },
        };
        const inboxTemplateDisplay = buildInboxTemplateDisplay(components, footerText);
        const storedPayload = {
            ...graphPayload,
            ...(inboxTemplateDisplay ? { inboxTemplateDisplay } : {}),
        };
        const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waPhoneNumberId)}/messages`;
        const rMeta = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.waAccessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(graphPayload),
        });
        const text = await rMeta.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!rMeta.ok) {
            console.error("[whatsapp/graph] send template FAILED", JSON.stringify({
                httpStatus: rMeta.status,
                companyId: req.auth?.companyId ?? null,
                userId: req.auth?.userId ?? null,
                to,
                templateName: name,
                languageCode,
                metaError: data,
            }));
            return res.status(rMeta.status).json({ error: "Meta send template failed", detail: data });
        }
        const wamid = typeof data === "object" && data && Array.isArray(data.messages)
            ? data.messages?.[0]?.id
            : undefined;
        const now = new Date();
        const bodyPreview = previewText ||
            (`Plantilla: ${name} (${languageCode})` +
                (Array.isArray(components) && components.length ? " · con variables" : ""));
        if (wamid) {
            await Message.findOneAndUpdate({ companyId: u0.companyId, wamid }, {
                $setOnInsert: {
                    companyId: u0.companyId,
                    waId: to,
                    wamid,
                    direction: "out",
                    type: "template",
                    bodyText: bodyPreview,
                    payload: storedPayload,
                    timestamp: now,
                },
            }, { upsert: true });
        }
        await Chat.findOneAndUpdate({ companyId: u0.companyId, waId: to }, {
            $set: {
                lastMessageAt: now,
                lastMessagePreview: bodyPreview,
            },
            $setOnInsert: { companyId: u0.companyId, waId: to },
        }, { upsert: true });
        console.info("[whatsapp/graph] send template ok", JSON.stringify({ companyId: String(u0.companyId), to, wamid: wamid ?? null, templateName: name, languageCode, metaResponse: data }, null, 0));
        return res.json(data);
    });
    r.post("/messages/text", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u?.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const company = await Company.findById(u.companyId).lean();
        const b = req.body ?? {};
        const to = canonicalWaId(normalizeDigits(b.to ?? ""));
        const text = String(b.text ?? "").trim();
        const displayName = String(b.displayName ?? "").trim();
        if (!to || !text)
            return res.status(400).json({ error: "to y text son obligatorios" });
        if (resolveOutboundChannel(company) === "qr_baileys") {
            if (!qrBase || !qrKey) {
                return res.status(503).json({ error: "Canal QR no disponible (servicio no configurado en el API)" });
            }
            let r2;
            try {
                r2 = await forwardMasssivoQr(String(u.companyId), "/messages/text", {
                    method: "POST",
                    body: JSON.stringify({ to, text }),
                });
            }
            catch (e) {
                console.error("[send/messages/text qr]", e);
                return res.status(500).json({ error: "Error al conectar con el servicio QR" });
            }
            const rawQ = await r2.text();
            if (!r2.ok) {
                let detail = rawQ;
                try {
                    detail = rawQ ? JSON.parse(rawQ) : null;
                }
                catch {
                    /* use rawQ */
                }
                return res.status(r2.status).json({ error: "Envío por QR fallido", detail });
            }
            const wamid = `qr-out-${new Types.ObjectId().toString()}`;
            const now = new Date();
            const payload = { channel: "qr_baileys", to, type: "text", text: { body: text } };
            await Message.findOneAndUpdate({ companyId: u.companyId, wamid }, {
                $setOnInsert: {
                    companyId: u.companyId,
                    waId: to,
                    wamid,
                    direction: "out",
                    type: "text",
                    bodyText: text,
                    payload,
                    timestamp: now,
                },
            }, { upsert: true });
            await Chat.findOneAndUpdate({ companyId: u.companyId, waId: to }, {
                $set: {
                    lastMessageAt: now,
                    lastMessagePreview: text,
                    ...(displayName ? { displayName } : {}),
                },
                $setOnInsert: { companyId: u.companyId, waId: to },
            }, { upsert: true });
            console.info("[qr-wa] send text ok", JSON.stringify({ companyId: String(u.companyId), to, wamid, synthetic: true }, null, 0));
            return res.json({ messaging_product: "whatsapp", channel: "qr_baileys", messages: [{ id: wamid }] });
        }
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const payload = {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text },
        };
        const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waPhoneNumberId)}/messages`;
        const rMeta = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.waAccessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const raw = await rMeta.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        }
        catch {
            data = { raw };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta send text failed", detail: data });
        const wamid = typeof data === "object" && data && Array.isArray(data.messages)
            ? data.messages?.[0]?.id
            : undefined;
        const now = new Date();
        if (wamid) {
            await Message.findOneAndUpdate({ companyId: u.companyId, wamid }, {
                $setOnInsert: {
                    companyId: u.companyId,
                    waId: to,
                    wamid,
                    direction: "out",
                    type: "text",
                    bodyText: text,
                    payload,
                    timestamp: now,
                },
            }, { upsert: true });
        }
        await Chat.findOneAndUpdate({ companyId: u.companyId, waId: to }, {
            $set: {
                lastMessageAt: now,
                lastMessagePreview: text,
                ...(displayName ? { displayName } : {}),
            },
            $setOnInsert: { companyId: u.companyId, waId: to },
        }, { upsert: true });
        console.info("[whatsapp/graph] send text ok", JSON.stringify({ companyId: String(u.companyId), to, wamid: wamid ?? null, metaResponse: data }, null, 0));
        return res.json(data);
    });
    /** Imagen por URL + leyenda opcional; solo canal WhatsApp Web (QR) → masssivo-qr-wa. */
    r.post("/messages/qr-image", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u?.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const company = await Company.findById(u.companyId).lean();
        if (resolveOutboundChannel(company) !== "qr_baileys") {
            return res.status(400).json({
                error: "El envío de imagen por URL con QR solo aplica con canal WhatsApp Web (QR) en Configuración → Mensajes.",
            });
        }
        if (!qrBase || !qrKey) {
            return res.status(503).json({ error: "Canal QR no disponible (servicio no configurado en el API)" });
        }
        const b = req.body ?? {};
        const to = canonicalWaId(normalizeDigits(b.to ?? ""));
        const imageUrl = String(b.imageUrl ?? "").trim();
        const caption = String(b.caption ?? "").trim();
        const displayName = String(b.displayName ?? "").trim();
        if (!to || !imageUrl)
            return res.status(400).json({ error: "to e imageUrl son obligatorios" });
        if (!/^https?:\/\//i.test(imageUrl))
            return res.status(400).json({ error: "imageUrl debe ser http(s)" });
        let r2;
        try {
            r2 = await forwardMasssivoQr(String(u.companyId), "/messages/image-url", {
                method: "POST",
                body: JSON.stringify({ to, imageUrl, ...(caption ? { caption } : {}) }),
            });
        }
        catch (e) {
            console.error("[send/messages/qr-image]", e);
            return res.status(500).json({ error: "Error al conectar con el servicio QR" });
        }
        const rawQ = await r2.text();
        if (!r2.ok) {
            let detail = rawQ;
            try {
                detail = rawQ ? JSON.parse(rawQ) : null;
            }
            catch {
                /* use rawQ */
            }
            return res.status(r2.status).json({ error: "Envío por QR fallido", detail });
        }
        const wamid = `qr-out-${new Types.ObjectId().toString()}`;
        const now = new Date();
        const preview = caption || "[imagen]";
        const payload = { channel: "qr_baileys", to, type: "image", imageUrl, caption: caption || undefined };
        await Message.findOneAndUpdate({ companyId: u.companyId, wamid }, {
            $setOnInsert: {
                companyId: u.companyId,
                waId: to,
                wamid,
                direction: "out",
                type: "image",
                bodyText: preview,
                payload,
                timestamp: now,
            },
        }, { upsert: true });
        await Chat.findOneAndUpdate({ companyId: u.companyId, waId: to }, {
            $set: {
                lastMessageAt: now,
                lastMessagePreview: preview,
                ...(displayName ? { displayName } : {}),
            },
            $setOnInsert: { companyId: u.companyId, waId: to },
        }, { upsert: true });
        console.info("[qr-wa] send image-url ok", JSON.stringify({ companyId: String(u.companyId), to, wamid, synthetic: true }, null, 0));
        return res.json({ messaging_product: "whatsapp", channel: "qr_baileys", messages: [{ id: wamid }] });
    });
    r.post("/messages/image", auth, upload.single("file"), async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const u = await User.findById(req.auth.userId).lean();
        if (!u?.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const coImg = await Company.findById(u.companyId).lean();
        if (resolveOutboundChannel(coImg) === "qr_baileys") {
            return res.status(400).json({
                error: "Canal de salida: WhatsApp Web (QR). Para enviar imágenes subí el archivo desde Mensajes o usá Emisión con plantilla imagen (URL del servidor).",
            });
        }
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const to = canonicalWaId(normalizeDigits(req.body?.to ?? ""));
        const caption = String(req.body?.caption ?? "").trim();
        const displayName = String(req.body?.displayName ?? "").trim();
        const file = req.file;
        if (!to || !file)
            return res.status(400).json({ error: "to y file son obligatorios" });
        const form = new FormData();
        form.append("messaging_product", "whatsapp");
        form.append("type", file.mimetype || "image/jpeg");
        form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }), file.originalname || "image.jpg");
        const uploadUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waPhoneNumberId)}/media`;
        const uploadResp = await fetch(uploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.waAccessToken}` },
            body: form,
        });
        const uploadText = await uploadResp.text();
        let uploadData = null;
        try {
            uploadData = uploadText ? JSON.parse(uploadText) : null;
        }
        catch {
            uploadData = { raw: uploadText };
        }
        if (!uploadResp.ok)
            return res.status(uploadResp.status).json({ error: "Meta upload media failed", detail: uploadData });
        const mediaId = typeof uploadData === "object" && uploadData && "id" in uploadData ? String(uploadData.id ?? "") : "";
        if (!mediaId)
            return res.status(502).json({ error: "No se recibió media id de Meta" });
        const payload = {
            messaging_product: "whatsapp",
            to,
            type: "image",
            image: {
                id: mediaId,
                ...(caption ? { caption } : {}),
            },
        };
        const sendUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waPhoneNumberId)}/messages`;
        const rMeta = await fetch(sendUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.waAccessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const raw = await rMeta.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        }
        catch {
            data = { raw };
        }
        if (!rMeta.ok)
            return res.status(rMeta.status).json({ error: "Meta send image failed", detail: data });
        const wamid = typeof data === "object" && data && Array.isArray(data.messages)
            ? data.messages?.[0]?.id
            : undefined;
        const now = new Date();
        if (wamid) {
            await Message.findOneAndUpdate({ companyId: u.companyId, wamid }, {
                $setOnInsert: {
                    companyId: u.companyId,
                    waId: to,
                    wamid,
                    direction: "out",
                    type: "image",
                    bodyText: caption || undefined,
                    payload,
                    timestamp: now,
                },
            }, { upsert: true });
        }
        await Chat.findOneAndUpdate({ companyId: u.companyId, waId: to }, {
            $set: {
                lastMessageAt: now,
                lastMessagePreview: caption || "[Imagen]",
                ...(displayName ? { displayName } : {}),
            },
            $setOnInsert: { companyId: u.companyId, waId: to },
        }, { upsert: true });
        console.info("[whatsapp/graph] send image ok", JSON.stringify({ companyId: String(u.companyId), to, wamid: wamid ?? null, mediaId, metaResponse: data }, null, 0));
        return res.json(data);
    });
    r.post("/media/upload", auth, upload.single("file"), async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const u = await User.findById(req.auth.userId).lean();
        if (!u?.companyId)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const file = req.file;
        const label = String(req.body?.label ?? "").trim();
        if (!file)
            return res.status(400).json({ error: "file es obligatorio" });
        const form = new FormData();
        form.append("messaging_product", "whatsapp");
        form.append("type", file.mimetype || "image/jpeg");
        form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }), file.originalname || "upload.bin");
        const uploadUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(cfg.waPhoneNumberId)}/media`;
        const uploadResp = await fetch(uploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.waAccessToken}` },
            body: form,
        });
        const raw = await uploadResp.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        }
        catch {
            data = { raw };
        }
        if (!uploadResp.ok)
            return res.status(uploadResp.status).json({ error: "Meta media upload failed", detail: data });
        const mediaId = typeof data === "object" && data && "id" in data ? String(data.id ?? "") : "";
        if (mediaId) {
            await UploadedMedia.create({
                companyId: u.companyId,
                mediaId,
                label: label || undefined,
                mimeType: file.mimetype || "",
                originalName: file.originalname || "",
            });
        }
        return res.json(data);
    });
    /**
     * Muestra para plantillas (HEADER IMAGE/VIDEO/DOCUMENT): solo Graph Resumible (`/{APP_ID}/uploads` → `h`).
     * El media id de `/{phone}/media` (Masividad) no es válido en header_handle al crear plantillas (Meta 131009 / 2494102).
     */
    r.post("/media/template-resumable", auth, upload.single("file"), async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "file es obligatorio (multipart campo file)" });
        const appId = resolveMetaAppId(cfg);
        if (!appId) {
            return res.status(400).json({
                error: "Meta no acepta el media id del número para la muestra de plantilla. Configura el ID numérico de tu app (developers.facebook.com → tu app → Configuración → Básico) en WhatsApp Cloud del panel, o la variable META_APP_ID en el servidor; luego vuelve a subir la imagen para obtener un identificador válido.",
            });
        }
        const fileType = metaResumableFileType(file.mimetype || "", file.originalname || "");
        if (!fileType) {
            return res.status(400).json({
                error: "Formato no admitido para muestra de plantilla. Usa JPG, JPEG, PNG, MP4 o PDF según Meta (Graph Resumable Upload).",
            });
        }
        const v = encodeURIComponent(cfg.graphApiVersion);
        const token = cfg.waAccessToken;
        const fileName = file.originalname || "sample.bin";
        const startParams = new URLSearchParams({
            file_name: fileName,
            file_length: String(file.size),
            file_type: fileType,
            access_token: token,
        });
        const startUrl = `https://graph.facebook.com/${v}/${encodeURIComponent(appId)}/uploads?${startParams.toString()}`;
        const startResp = await fetch(startUrl, { method: "POST" });
        const startText = await startResp.text();
        let startData = null;
        try {
            startData = startText ? JSON.parse(startText) : null;
        }
        catch {
            startData = { raw: startText };
        }
        if (!startResp.ok) {
            return res.status(startResp.status).json({ error: "Meta no pudo iniciar la subida resumible", detail: startData });
        }
        const sessionId = typeof startData === "object" && startData && "id" in startData
            ? String(startData.id ?? "")
            : "";
        if (!sessionId)
            return res.status(502).json({ error: "Meta no devolvió id de sesión de subida", detail: startData });
        // Importante: el id suele ser `upload:…` con dos puntos literales; NO usar encodeURIComponent
        // sobre el id completo (convierte `:` en %3A y Meta responde "Object does not exist").
        const graphUploadUrl = `https://graph.facebook.com/${cfg.graphApiVersion}/${sessionId}`;
        const uploadUrlObj = new URL(graphUploadUrl);
        uploadUrlObj.searchParams.set("access_token", token);
        const uploadResp = await fetch(uploadUrlObj.toString(), {
            method: "POST",
            headers: {
                Authorization: `OAuth ${token}`,
                file_offset: "0",
                "Content-Type": "application/octet-stream",
            },
            body: Buffer.from(file.buffer),
        });
        const uploadText = await uploadResp.text();
        let uploadData = null;
        try {
            uploadData = uploadText ? JSON.parse(uploadText) : null;
        }
        catch {
            uploadData = { raw: uploadText };
        }
        if (!uploadResp.ok) {
            return res.status(uploadResp.status).json({ error: "Meta no pudo completar la subida de muestra", detail: uploadData });
        }
        const handle = typeof uploadData === "object" && uploadData && "h" in uploadData
            ? String(uploadData.h ?? "")
            : "";
        if (!handle)
            return res.status(502).json({ error: "Meta no devolvió el handle de muestra (campo h)", detail: uploadData });
        return res.json({ handle });
    });
    r.get("/media/uploads", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const rows = await UploadedMedia.find({ companyId: req.auth.companyId }).sort({ createdAt: -1 }).limit(100).lean();
        return res.json(rows);
    });
    r.get("/media/:mediaId", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const got = await getCompanyWhatsappConfigByAuthUser(req.auth.userId);
        if ("error" in got) {
            const err = got.error ?? { code: 500, message: "Error interno" };
            return res.status(err.code).json({ error: err.message });
        }
        const { cfg } = got;
        const mediaId = String(req.params.mediaId ?? "").trim();
        if (!mediaId)
            return res.status(400).json({ error: "mediaId inválido" });
        const metaInfoUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.graphApiVersion)}/${encodeURIComponent(mediaId)}`;
        const metaInfoResp = await fetch(metaInfoUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${cfg.waAccessToken}` },
        });
        const metaInfoText = await metaInfoResp.text();
        let metaInfo = null;
        try {
            metaInfo = metaInfoText ? JSON.parse(metaInfoText) : null;
        }
        catch {
            metaInfo = { raw: metaInfoText };
        }
        if (!metaInfoResp.ok)
            return res.status(metaInfoResp.status).json({ error: "Meta media info failed", detail: metaInfo });
        const mediaUrl = typeof metaInfo === "object" && metaInfo && "url" in metaInfo ? String(metaInfo.url ?? "") : "";
        if (!mediaUrl)
            return res.status(404).json({ error: "No se pudo resolver URL de media" });
        const mediaResp = await fetch(mediaUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${cfg.waAccessToken}` },
        });
        if (!mediaResp.ok) {
            const errText = await mediaResp.text();
            return res.status(mediaResp.status).json({ error: "Meta media download failed", detail: errText });
        }
        const ab = await mediaResp.arrayBuffer();
        const contentTypeFromMetaInfo = typeof metaInfo === "object" && metaInfo && "mime_type" in metaInfo ? String(metaInfo.mime_type ?? "") : "";
        res.setHeader("Content-Type", contentTypeFromMetaInfo || mediaResp.headers.get("content-type") || "application/octet-stream");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(Buffer.from(ab));
    });
    r.get("/clients", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const rows = await Client.find({ companyId: req.auth.companyId }).sort({ updatedAt: -1 }).lean();
        return res.json(rows);
    });
    r.post("/clients", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const b = req.body ?? {};
        const name = String(b.name ?? "").trim();
        const email = String(b.email ?? "").trim().toLowerCase();
        const phone = normalizeDigits(b.phone ?? "");
        const companyName = String(b.companyName ?? "").trim();
        const notes = String(b.notes ?? "");
        if (!name || !phone)
            return res.status(400).json({ error: "Nombre y teléfono son obligatorios" });
        const doc = await Client.create({
            companyId: req.auth.companyId,
            name,
            email: email || undefined,
            phone,
            companyName: companyName || undefined,
            notes,
            status: "active",
        });
        return res.status(201).json(doc);
    });
    r.patch("/clients/:id", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const id = req.params.id;
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "ID inválido" });
        const b = req.body ?? {};
        const patch = {};
        if (typeof b.name === "string")
            patch.name = b.name.trim();
        if (typeof b.email === "string")
            patch.email = b.email.trim().toLowerCase() || undefined;
        if (typeof b.phone === "string")
            patch.phone = normalizeDigits(b.phone);
        if (typeof b.companyName === "string")
            patch.companyName = b.companyName.trim() || undefined;
        if (typeof b.notes === "string")
            patch.notes = b.notes;
        if (b.status === "active" || b.status === "inactive")
            patch.status = b.status;
        const doc = await Client.findOneAndUpdate({ _id: id, companyId: req.auth.companyId }, { $set: patch }, { new: true }).lean();
        if (!doc)
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.json(doc);
    });
    r.delete("/clients/:id", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const id = req.params.id;
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "ID inválido" });
        const r0 = await Client.deleteOne({ _id: id, companyId: req.auth.companyId });
        if (!r0.deletedCount)
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.json({ ok: true });
    });
    r.post("/massivity/campaigns", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const b = req.body ?? {};
        const name = String(b.name ?? "").trim();
        const fileName = String(b.fileName ?? "").trim();
        const phoneColumn = String(b.phoneColumn ?? "").trim();
        const templateName = String(b.templateName ?? "").trim();
        const languageCode = String(b.languageCode ?? "").trim();
        const intervalSec = Math.max(1, Number(b.intervalSec) || 1);
        const rowCount = Math.max(0, Number(b.rowCount) || 0);
        const variableMapping = b.variableMapping ?? {};
        const headerImageModeRaw = String(b.headerImageMode ?? "").trim();
        const headerImageMode = headerImageModeRaw === "url" || headerImageModeRaw === "mediaId" ? headerImageModeRaw : undefined;
        const headerImageUrl = String(b.headerImageUrl ?? "").trim();
        const headerImageMediaId = String(b.headerImageMediaId ?? "").trim();
        if (!name || !phoneColumn || !templateName || !languageCode) {
            return res.status(400).json({ error: "name, phoneColumn, templateName y languageCode son obligatorios" });
        }
        const sendChannelRaw = String(b.sendChannel ?? "").trim();
        const sendChannel = sendChannelRaw === "qr_baileys" ? "qr_baileys" : "cloud_hsm";
        const qrTplRaw = String(b.qrMessageTemplateId ?? "").trim();
        const qrMessageTemplateId = sendChannel === "qr_baileys" && qrTplRaw && isValidObjectId(qrTplRaw) ? new Types.ObjectId(qrTplRaw) : undefined;
        const doc = await MassCampaign.create({
            companyId: req.auth.companyId,
            name,
            fileName,
            phoneColumn,
            templateName,
            languageCode,
            sendChannel,
            ...(qrMessageTemplateId ? { qrMessageTemplateId } : {}),
            variableMapping,
            headerImageMode,
            headerImageUrl: headerImageUrl || undefined,
            headerImageMediaId: headerImageMediaId || undefined,
            intervalSec,
            rowCount,
            status: "draft",
        });
        return res.status(201).json(doc);
    });
    r.get("/massivity/campaigns", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const ch = String(req.query.sendChannel ?? "").trim();
        const filter = { companyId: req.auth.companyId };
        if (ch === "qr_baileys") {
            filter.sendChannel = "qr_baileys";
        }
        else if (ch === "cloud_hsm") {
            filter.sendChannel = { $ne: "qr_baileys" };
        }
        const rows = await MassCampaign.find(filter)
            .sort({ createdAt: -1 })
            .limit(30)
            .select("-rowResults")
            .lean();
        return res.json(rows);
    });
    r.get("/massivity/campaigns/:id", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const id = String(req.params.id ?? "");
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "ID inválido" });
        const doc = await MassCampaign.findOne({ _id: id, companyId: req.auth.companyId }).lean();
        if (!doc)
            return res.status(404).json({ error: "Campaña no encontrada" });
        return res.json(doc);
    });
    r.patch("/massivity/campaigns/:id/status", auth, async (req, res) => {
        if (!req.auth?.companyId)
            return res.status(403).json({ error: "Debes configurar tu empresa primero" });
        const id = String(req.params.id ?? "");
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "ID inválido" });
        const status = String(req.body?.status ?? "").trim();
        if (!["draft", "sent"].includes(status))
            return res.status(400).json({ error: "status inválido" });
        const sentCountBody = Math.max(0, Number(req.body?.sentCount) || 0);
        const failCountBody = Math.max(0, Number(req.body?.failCount) || 0);
        const rawRowResults = req.body.rowResults;
        let rowResults;
        if (Array.isArray(rawRowResults)) {
            const normalized = [];
            for (const item of rawRowResults) {
                if (!item || typeof item !== "object")
                    continue;
                const o = item;
                const rowIndex = Math.floor(Number(o.rowIndex));
                if (!Number.isFinite(rowIndex) || rowIndex < 1)
                    continue;
                const phone = String(o.phone ?? "")
                    .replace(/\D/g, "")
                    .slice(0, 24);
                const wamid = String(o.wamid ?? "")
                    .trim()
                    .slice(0, 160);
                const deliveryStatus = String(o.deliveryStatus ?? "")
                    .trim()
                    .slice(0, 64);
                const reason = String(o.reason ?? "")
                    .trim()
                    .slice(0, 500);
                const row = { rowIndex, phone };
                if (wamid)
                    row.wamid = wamid;
                if (typeof o.apiOk === "boolean")
                    row.apiOk = o.apiOk;
                if (deliveryStatus)
                    row.deliveryStatus = deliveryStatus;
                if (typeof o.ok === "boolean")
                    row.ok = o.ok;
                if (reason)
                    row.reason = reason;
                const dua = o.deliveryUpdatedAt;
                if (dua) {
                    const d = new Date(String(dua));
                    if (!Number.isNaN(d.getTime()))
                        row.deliveryUpdatedAt = d;
                }
                normalized.push(row);
                if (normalized.length >= 50_000)
                    break;
            }
            rowResults = normalized;
        }
        let mergedRowResults = rowResults;
        if (rowResults !== undefined) {
            const existingDoc = (await MassCampaign.findOne({ _id: id, companyId: req.auth.companyId }).lean());
            if (!existingDoc)
                return res.status(404).json({ error: "Campaña no encontrada" });
            mergedRowResults = mergeIncomingRowResultsWithExisting(existingDoc.rowResults, rowResults);
        }
        const $set = { status };
        if (mergedRowResults !== undefined) {
            $set.rowResults = mergedRowResults;
            const stats = computeDeliveryStatsFromRows(mergedRowResults);
            $set.sentCount = stats.sentCount;
            $set.failCount = stats.failCount;
            $set.deliveredCount = stats.deliveredCount;
            $set.deliveryFailedCount = stats.deliveryFailedCount;
            $set.pendingDeliveryCount = stats.pendingDeliveryCount;
        }
        else {
            $set.sentCount = sentCountBody;
            $set.failCount = failCountBody;
        }
        const doc = await MassCampaign.findOneAndUpdate({ _id: id, companyId: req.auth.companyId }, { $set }, { new: true }).lean();
        if (!doc)
            return res.status(404).json({ error: "Campaña no encontrada" });
        return res.json(doc);
    });
    /** --- Plantillas de mensaje para campaña QR (guardadas en Mongo, no Meta) --- */
    r.get("/qr/templates", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        try {
            const list = await QrMessageTemplate.find({ companyId: new Types.ObjectId(String(cid)) })
                .sort({ updatedAt: -1 })
                .lean();
            return res.json(list.map((row) => enrichQr(row) ?? row));
        }
        catch (e) {
            console.error("[send/qr/templates GET]", e);
            return res.status(500).json({ error: "Error al listar plantillas" });
        }
    });
    r.get("/qr/templates/:id", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const { id } = req.params;
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "Id inválido" });
        try {
            const doc = await QrMessageTemplate.findOne({ _id: id, companyId: new Types.ObjectId(String(cid)) }).lean();
            if (!doc)
                return res.status(404).json({ error: "Plantilla no encontrada" });
            return res.json(enrichQr(doc) ?? doc);
        }
        catch (e) {
            console.error("[send/qr/templates/:id GET]", e);
            return res.status(500).json({ error: "Error al leer plantilla" });
        }
    });
    r.post("/qr/templates", auth, maybeQrTemplateMultipart, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const file = req.file;
        const multipart = Boolean(file?.path);
        const b = req.body || {};
        const name = String(b.name ?? "").trim();
        /** Plantillas QR no usan Meta HSM; el modelo conserva campos por compatibilidad. */
        const metaTemplateName = "";
        const languageCodeMeta = "es";
        if (!name)
            return res.status(400).json({ error: "El nombre es obligatorio" });
        const contentType = String(b.contentType ?? "").toLowerCase();
        if (contentType !== "text" && contentType !== "image")
            return res.status(400).json({ error: "contentType debe ser text o image" });
        const text = String(b.text ?? "").trim();
        const caption = String(b.caption ?? "").trim();
        const imageUrl = String(b.imageUrl ?? "").trim();
        if (contentType === "text" && !text)
            return res.status(400).json({ error: "El texto no puede estar vacío" });
        if (contentType === "text" && multipart)
            return res.status(400).json({ error: "Plantilla de texto: usá JSON (sin archivos)" });
        if (contentType === "text") {
            try {
                assertMetaStyleConsecutiveTemplateVarsInText(text, "el mensaje");
            }
            catch (ve) {
                const msg = ve instanceof Error ? ve.message : String(ve);
                return res.status(400).json({ error: msg });
            }
            try {
                const doc = await QrMessageTemplate.create({
                    companyId: new Types.ObjectId(String(cid)),
                    name,
                    contentType,
                    text,
                    imageUrl: "",
                    imageBucket: "",
                    imageObjectKey: "",
                    caption: "",
                    metaTemplateName,
                    languageCode: languageCodeMeta,
                });
                return res.status(201).json(enrichQr(doc.toObject()) ?? doc.toObject());
            }
            catch (e) {
                console.error("[send/qr/templates POST]", e);
                return res.status(500).json({ error: "Error al guardar plantilla" });
            }
        }
        // image
        try {
            assertMetaStyleConsecutiveTemplateVarsInText(caption, "la leyenda");
        }
        catch (ve) {
            if (file?.path)
                void unlink(file.path).catch(() => { });
            const msg = ve instanceof Error ? ve.message : String(ve);
            return res.status(400).json({ error: msg });
        }
        if (isQrStorageEnabled() && deps.mediaServiceUrl) {
            if (multipart && file?.path) {
                try {
                    const up = await uploadFileToMediaService(deps.mediaServiceUrl, deps.mediaServiceKey, file.path, String(cid), file.originalname, file.mimetype);
                    await unlink(file.path).catch(() => { });
                    const doc = await QrMessageTemplate.create({
                        companyId: new Types.ObjectId(String(cid)),
                        name,
                        contentType: "image",
                        text: "",
                        imageUrl: "",
                        imageBucket: up.bucket,
                        imageObjectKey: up.key,
                        caption,
                        metaTemplateName,
                        languageCode: languageCodeMeta,
                    });
                    return res.status(201).json(enrichQr(doc.toObject()) ?? doc.toObject());
                }
                catch (e) {
                    if (file?.path)
                        void unlink(file.path).catch(() => { });
                    const msg = e instanceof Error ? e.message : "Error al subir la imagen";
                    console.error("[send/qr/templates POST upload]", e);
                    return res.status(502).json({ error: msg });
                }
            }
            if (!multipart && imageUrl && /^https?:\/\//i.test(imageUrl)) {
                if (file?.path)
                    void unlink(file.path).catch(() => { });
                const doc = await QrMessageTemplate.create({
                    companyId: new Types.ObjectId(String(cid)),
                    name,
                    contentType: "image",
                    text: "",
                    imageUrl,
                    imageBucket: "",
                    imageObjectKey: "",
                    caption,
                    metaTemplateName,
                    languageCode: languageCodeMeta,
                });
                return res.status(201).json(enrichQr(doc.toObject()) ?? doc.toObject());
            }
            if (file?.path)
                void unlink(file.path).catch(() => { });
            return res.status(400).json({
                error: "Con almacenamiento: subí un archivo (campo image) o indicá imageUrl (https) en JSON",
            });
        }
        if (!imageUrl) {
            if (file?.path)
                void unlink(file.path).catch(() => { });
            return res.status(400).json({ error: "La URL de la imagen es obligatoria (o configurá almacenamiento + subida de archivo)" });
        }
        if (!/^https?:\/\//i.test(imageUrl)) {
            if (file?.path)
                void unlink(file.path).catch(() => { });
            return res.status(400).json({ error: "imageUrl debe ser http(s)" });
        }
        if (file?.path)
            void unlink(file.path).catch(() => { });
        try {
            const doc = await QrMessageTemplate.create({
                companyId: new Types.ObjectId(String(cid)),
                name,
                contentType: "image",
                text: "",
                imageUrl,
                imageBucket: "",
                imageObjectKey: "",
                caption,
                metaTemplateName,
                languageCode: languageCodeMeta,
            });
            return res.status(201).json(enrichQr(doc.toObject()) ?? doc.toObject());
        }
        catch (e) {
            console.error("[send/qr/templates POST]", e);
            return res.status(500).json({ error: "Error al guardar plantilla" });
        }
    });
    r.put("/qr/templates/:id", auth, maybeQrTemplateMultipart, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const { id } = req.params;
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "Id inválido" });
        const file = req.file;
        const multipart = Boolean(file?.path);
        const b = req.body || {};
        const name = String(b.name ?? "").trim();
        const metaTemplateName = "";
        const languageCodeMeta = "es";
        if (!name)
            return res.status(400).json({ error: "El nombre es obligatorio" });
        const contentType = String(b.contentType ?? "").toLowerCase();
        if (contentType !== "text" && contentType !== "image")
            return res.status(400).json({ error: "contentType debe ser text o image" });
        const text = String(b.text ?? "").trim();
        const caption = String(b.caption ?? "").trim();
        const imageUrl = String(b.imageUrl ?? "").trim();
        const keepImage = b.keepImage === true || b.keepImage === 1 || String(b.keepImage ?? "") === "1" || String(b.keepImage ?? "").toLowerCase() === "true";
        if (contentType === "text" && !text)
            return res.status(400).json({ error: "El texto no puede estar vacío" });
        if (contentType === "text" && multipart)
            return res.status(400).json({ error: "Plantilla de texto: usá JSON (sin archivos)" });
        if (contentType === "text") {
            try {
                assertMetaStyleConsecutiveTemplateVarsInText(text, "el mensaje");
            }
            catch (ve) {
                const msg = ve instanceof Error ? ve.message : String(ve);
                return res.status(400).json({ error: msg });
            }
            try {
                const existing = await QrMessageTemplate.findOne({ _id: id, companyId: new Types.ObjectId(String(cid)) }).lean();
                if (!existing) {
                    if (file?.path)
                        void unlink(file.path).catch(() => { });
                    return res.status(404).json({ error: "Plantilla no encontrada" });
                }
                if (isQrStorageEnabled() && existing?.imageObjectKey) {
                    try {
                        await deleteObjectFromMediaService(deps.mediaServiceUrl, deps.mediaServiceKey, String(existing.imageObjectKey));
                    }
                    catch (e) {
                        console.error("[send/qr/templates] delete old image on type switch", e);
                    }
                }
                const doc = await QrMessageTemplate.findOneAndUpdate({ _id: id, companyId: new Types.ObjectId(String(cid)) }, {
                    $set: {
                        name,
                        contentType,
                        text,
                        imageUrl: "",
                        imageBucket: "",
                        imageObjectKey: "",
                        caption: "",
                        metaTemplateName,
                        languageCode: languageCodeMeta,
                    },
                }, { new: true }).lean();
                if (!doc)
                    return res.status(404).json({ error: "Plantilla no encontrada" });
                return res.json(enrichQr(doc) ?? doc);
            }
            catch (e) {
                if (file?.path)
                    void unlink(file.path).catch(() => { });
                console.error("[send/qr/templates/:id PUT]", e);
                return res.status(500).json({ error: "Error al actualizar plantilla" });
            }
        }
        // image
        try {
            assertMetaStyleConsecutiveTemplateVarsInText(caption, "la leyenda");
        }
        catch (ve) {
            if (file?.path)
                void unlink(file.path).catch(() => { });
            const msg = ve instanceof Error ? ve.message : String(ve);
            return res.status(400).json({ error: msg });
        }
        const existing = await QrMessageTemplate.findOne({ _id: id, companyId: new Types.ObjectId(String(cid)) }).lean();
        if (!existing) {
            if (file?.path)
                void unlink(file.path).catch(() => { });
            return res.status(404).json({ error: "Plantilla no encontrada" });
        }
        if (isQrStorageEnabled() && deps.mediaServiceUrl) {
            if (multipart && file?.path) {
                if (existing.imageObjectKey) {
                    try {
                        await deleteObjectFromMediaService(deps.mediaServiceUrl, deps.mediaServiceKey, String(existing.imageObjectKey));
                    }
                    catch (e) {
                        console.error("[send/qr/templates] delete old on replace", e);
                    }
                }
                try {
                    const up = await uploadFileToMediaService(deps.mediaServiceUrl, deps.mediaServiceKey, file.path, String(cid), file.originalname, file.mimetype);
                    await unlink(file.path).catch(() => { });
                    const doc = await QrMessageTemplate.findOneAndUpdate({ _id: id, companyId: new Types.ObjectId(String(cid)) }, {
                        $set: {
                            name,
                            contentType: "image",
                            text: "",
                            imageUrl: "",
                            imageBucket: up.bucket,
                            imageObjectKey: up.key,
                            caption,
                            metaTemplateName,
                            languageCode: languageCodeMeta,
                        },
                    }, { new: true }).lean();
                    if (!doc)
                        return res.status(404).json({ error: "Plantilla no encontrada" });
                    return res.json(enrichQr(doc) ?? doc);
                }
                catch (e) {
                    if (file?.path)
                        void unlink(file.path).catch(() => { });
                    const msg = e instanceof Error ? e.message : "Error al subir la imagen";
                    console.error("[send/qr/templates PUT upload]", e);
                    return res.status(502).json({ error: msg });
                }
            }
        }
        if (keepImage && !file?.path && (existing.imageObjectKey || (existing.imageUrl && existing.imageUrl.trim()))) {
            const doc = await QrMessageTemplate.findOneAndUpdate({ _id: id, companyId: new Types.ObjectId(String(cid)) }, {
                $set: {
                    name,
                    contentType: "image",
                    text: "",
                    caption,
                    metaTemplateName,
                    languageCode: languageCodeMeta,
                },
            }, { new: true }).lean();
            if (!doc)
                return res.status(404).json({ error: "Plantilla no encontrada" });
            return res.json(enrichQr(doc) ?? doc);
        }
        if (multipart && file?.path) {
            void unlink(file.path).catch(() => { });
            if (isQrStorageEnabled()) {
                return res.status(400).json({ error: "Solicitud inválida" });
            }
            return res.status(400).json({ error: "Subida requiere configurar el microservicio de medios (MEDIA_SERVICE_*)" });
        }
        if (file?.path)
            void unlink(file.path).catch(() => { });
        const imageUrlToSave = imageUrl || String(existing.imageUrl ?? "").trim();
        if (!imageUrlToSave)
            return res.status(400).json({ error: "Indicá imageUrl (https) o subí imagen" });
        if (!/^https?:\/\//i.test(imageUrlToSave))
            return res.status(400).json({ error: "imageUrl debe ser http(s)" });
        const doc = await QrMessageTemplate.findOneAndUpdate({ _id: id, companyId: new Types.ObjectId(String(cid)) }, {
            $set: {
                name,
                contentType: "image",
                text: "",
                imageUrl: imageUrlToSave,
                imageBucket: "",
                imageObjectKey: "",
                caption,
                metaTemplateName,
                languageCode: languageCodeMeta,
            },
        }, { new: true }).lean();
        if (!doc)
            return res.status(404).json({ error: "Plantilla no encontrada" });
        return res.json(enrichQr(doc) ?? doc);
    });
    r.delete("/qr/templates/:id", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        const { id } = req.params;
        if (!isValidObjectId(id))
            return res.status(400).json({ error: "Id inválido" });
        try {
            const ex = await QrMessageTemplate.findOne({ _id: id, companyId: new Types.ObjectId(String(cid)) })
                .select({ imageObjectKey: 1 })
                .lean();
            if (!ex)
                return res.status(404).json({ error: "Plantilla no encontrada" });
            if (isQrStorageEnabled() && ex.imageObjectKey) {
                try {
                    await deleteObjectFromMediaService(deps.mediaServiceUrl, deps.mediaServiceKey, String(ex.imageObjectKey));
                }
                catch (e) {
                    console.error("[send/qr/templates DELETE] storage", e);
                }
            }
            const r0 = await QrMessageTemplate.deleteOne({ _id: id, companyId: new Types.ObjectId(String(cid)) });
            if (r0.deletedCount === 0)
                return res.status(404).json({ error: "Plantilla no encontrada" });
            return res.status(204).send();
        }
        catch (e) {
            console.error("[send/qr/templates/:id DELETE]", e);
            return res.status(500).json({ error: "Error al eliminar" });
        }
    });
    /** --- Proxy a microservicio QR (Baileys), sin exponer el puerto al cliente --- */
    r.post("/qr/session/start", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        if (!qrBase || !qrKey)
            return res.status(501).json({ error: "Canal QR no configurado" });
        try {
            const r2 = await forwardMasssivoQr(String(cid), "/session/start", { method: "POST" });
            const text = await r2.text();
            return res.status(r2.status).type("json").send(text);
        }
        catch (e) {
            console.error("[send/qr/session/start]", e);
            return res.status(500).json({ error: "Error al conectar con el servicio QR" });
        }
    });
    r.post("/qr/session/logout", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        if (!qrBase || !qrKey)
            return res.status(501).json({ error: "Canal QR no configurado" });
        try {
            const r2 = await forwardMasssivoQr(String(cid), "/session/logout", { method: "POST" });
            const text = await r2.text();
            return res.status(r2.status).type("json").send(text);
        }
        catch (e) {
            console.error("[send/qr/session/logout]", e);
            return res.status(500).json({ error: "Error al conectar con el servicio QR" });
        }
    });
    r.get("/qr/status", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        if (!qrBase || !qrKey)
            return res.status(501).json({ error: "Canal QR no configurado" });
        try {
            const r2 = await forwardMasssivoQr(String(cid), "/status", { method: "GET" });
            const text = await r2.text();
            return res.status(r2.status).type("json").send(text);
        }
        catch (e) {
            console.error("[send/qr/status]", e);
            return res.status(500).json({ error: "Error al conectar con el servicio QR" });
        }
    });
    r.post("/qr/messages/text", auth, async (req, res) => {
        if (!req.auth)
            return res.status(401).json({ error: "No autenticado" });
        const cid = req.auth.companyId;
        if (!cid)
            return res.status(400).json({ error: "Debes crear empresa primero" });
        if (!qrBase || !qrKey)
            return res.status(501).json({ error: "Canal QR no configurado" });
        try {
            const r2 = await forwardMasssivoQr(String(cid), "/messages/text", {
                method: "POST",
                body: JSON.stringify(req.body ?? {}),
            });
            const text = await r2.text();
            return res.status(r2.status).type("json").send(text);
        }
        catch (e) {
            console.error("[send/qr/messages/text]", e);
            return res.status(500).json({ error: "Error al conectar con el servicio QR" });
        }
    });
    return r;
}
//# sourceMappingURL=sendApi.js.map