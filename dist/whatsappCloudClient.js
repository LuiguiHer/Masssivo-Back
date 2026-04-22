/**
 * Cliente HTTP para WhatsApp Cloud API (Graph API).
 * Rutas y cuerpos alineados con la colección Postman oficial.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class WhatsAppCloudError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.name = "WhatsAppCloudError";
        this.status = status;
        this.body = body;
    }
}
export class WhatsAppCloudClient {
    accessToken;
    graphVersion;
    phoneNumberId;
    base;
    constructor(accessToken, graphVersion, phoneNumberId) {
        this.accessToken = accessToken;
        this.graphVersion = graphVersion;
        this.phoneNumberId = phoneNumberId;
        this.base = `https://graph.facebook.com/${graphVersion}`;
    }
    get phoneId() {
        return this.phoneNumberId;
    }
    authHeaders(json = true) {
        const h = { Authorization: `Bearer ${this.accessToken}` };
        if (json)
            h["Content-Type"] = "application/json";
        return h;
    }
    async parseJson(res) {
        const text = await res.text();
        if (!text)
            return {};
        try {
            return JSON.parse(text);
        }
        catch {
            return { raw: text };
        }
    }
    async request(method, path, opts) {
        const q = opts?.query
            ? "?" +
                new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v != null)).toString()
            : "";
        const url = `${this.base}${path}${q}`;
        const json = opts?.json !== false;
        const init = { method, headers: this.authHeaders(json) };
        if (opts?.body !== undefined && method !== "GET" && method !== "DELETE") {
            init.body = json ? JSON.stringify(opts.body) : opts.body;
        }
        const res = await fetch(url, init);
        const data = await this.parseJson(res);
        if (!res.ok) {
            const msg = typeof data === "object" && data && "error" in data
                ? String(data.error?.message ?? res.statusText)
                : res.statusText;
            throw new WhatsAppCloudError(msg, res.status, data);
        }
        return data;
    }
    /** Postman: Subscribe to your WABA → POST /{WABA-ID}/subscribed_apps */
    subscribeAppToWaba(wabaId) {
        return this.request("POST", `/${wabaId}/subscribed_apps`, { body: {} });
    }
    /** Postman: Get owned WABAs */
    getOwnedWabas(businessPortfolioId) {
        return this.request("GET", `/${businessPortfolioId}/owned_whatsapp_business_accounts`);
    }
    /** Postman: Get shared WABAs */
    getSharedWabas(businessPortfolioId) {
        return this.request("GET", `/${businessPortfolioId}/client_whatsapp_business_accounts`);
    }
    /** Postman: Get Phone Numbers → GET /{WABA-ID}/phone_numbers */
    listPhoneNumbers(wabaId) {
        return this.request("GET", `/${wabaId}/phone_numbers`);
    }
    /** Postman: Register Phone Number */
    registerPhone(phoneNumberId, pin6) {
        return this.request("POST", `/${phoneNumberId}/register`, {
            body: { messaging_product: "whatsapp", pin: pin6 },
        });
    }
    /** Postman: Deregister Phone */
    deregisterPhone(phoneNumberId) {
        return this.request("POST", `/${phoneNumberId}/deregister`, { body: {} });
    }
    /**
     * Postman: Send Text Message, templates, media, etc.
     * POST /{Phone-Number-ID}/messages
     */
    sendMessage(body) {
        return this.request("POST", `/${this.phoneNumberId}/messages`, { body });
    }
    sendTextMessage(toE164, text, options) {
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: toE164,
            type: "text",
            text: { preview_url: options?.previewUrl ?? false, body: text },
        };
        if (options?.replyToMessageId) {
            payload.context = { message_id: options.replyToMessageId };
        }
        return this.sendMessage(payload);
    }
    sendTemplateMessage(toE164, templateName, languageCode, components) {
        return this.sendMessage({
            messaging_product: "whatsapp",
            to: toE164,
            type: "template",
            template: {
                name: templateName,
                language: { code: languageCode },
                ...(components?.length ? { components } : {}),
            },
        });
    }
    /** Postman: Mark Message As Read → PUT /{Phone-Number-ID}/messages */
    markMessageAsRead(wamid) {
        return this.request("PUT", `/${this.phoneNumberId}/messages`, {
            body: { messaging_product: "whatsapp", status: "read", message_id: wamid },
        });
    }
    /** Postman: Debug Access Token */
    debugToken(inputToken) {
        return this.request("GET", "/debug_token", { query: { input_token: inputToken } });
    }
    /** Postman: Retrieve Media URL */
    getMediaMetadata(mediaId, phoneNumberId) {
        const pid = phoneNumberId ?? this.phoneNumberId;
        return this.request("GET", `/${mediaId}`, { query: { phone_number_id: pid } });
    }
    /** Descarga binarios usando la URL temporal (válida ~5 min) + Bearer */
    async downloadMedia(mediaId) {
        const meta = await this.getMediaMetadata(mediaId);
        if (!meta.url)
            throw new Error("La API no devolvió url para el media");
        const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
        if (!res.ok)
            throw new WhatsAppCloudError("Fallo al descargar media", res.status, await res.text());
        const buffer = await res.arrayBuffer();
        return { buffer, mimeType: meta.mime_type };
    }
    /**
     * Postman: Upload Image (multipart) → POST /{Phone-Number-ID}/media
     */
    async uploadMediaFile(file, filename, mimeType) {
        const fd = new FormData();
        fd.set("messaging_product", "whatsapp");
        const blob = Buffer.isBuffer(file)
            ? new Blob([new Uint8Array(file)], { type: mimeType })
            : file;
        fd.set("file", blob, filename);
        const url = `${this.base}/${this.phoneNumberId}/media`;
        const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}` }, body: fd });
        const data = await this.parseJson(res);
        if (!res.ok) {
            const msg = typeof data === "object" && data && "error" in data
                ? String(data.error?.message ?? res.statusText)
                : res.statusText;
            throw new WhatsAppCloudError(msg, res.status, data);
        }
        return data;
    }
    /** Postman: Delete Media */
    deleteMedia(mediaId, phoneNumberId) {
        const pid = phoneNumberId ?? this.phoneNumberId;
        return this.request("DELETE", `/${mediaId}/`, { query: { phone_number_id: pid }, json: false });
    }
}
//# sourceMappingURL=whatsappCloudClient.js.map