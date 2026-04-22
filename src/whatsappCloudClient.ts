/**
 * Cliente HTTP para WhatsApp Cloud API (Graph API).
 * Rutas y cuerpos alineados con la colección Postman oficial.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */

export type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

export class WhatsAppCloudError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "WhatsAppCloudError";
    this.status = status;
    this.body = body;
  }
}

export type SendMessageResponse = {
  messaging_product: string;
  contacts?: {
    input: string;
    wa_id: string;
  }[];
  messages?: {
    id: string;
  }[];
};

type RequestOpts = {
  query?: Record<string, string | undefined | null>;
  body?: Record<string, unknown> | BodyInit;
  json?: boolean;
};

export class WhatsAppCloudClient {
  private readonly accessToken: string;
  private readonly graphVersion: string;
  private readonly phoneNumberId: string;
  private readonly base: string;

  constructor(accessToken: string, graphVersion: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.graphVersion = graphVersion;
    this.phoneNumberId = phoneNumberId;
    this.base = `https://graph.facebook.com/${graphVersion}`;
  }

  get phoneId(): string {
    return this.phoneNumberId;
  }

  private authHeaders(json = true): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.accessToken}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private async parseJson(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  private async request(method: string, path: string, opts?: RequestOpts): Promise<unknown> {
    const q = opts?.query
      ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v != null) as [string, string][]).toString()}`
      : "";
    const url = `${this.base}${path}${q}`;
    const json = opts?.json !== false;
    const init: RequestInit = { method, headers: this.authHeaders(json) };
    if (opts?.body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = json ? JSON.stringify(opts.body) : (opts.body as BodyInit);
    }
    const res = await fetch(url, init);
    const data = await this.parseJson(res);
    if (!res.ok) {
      const errObj = data as GraphErrorBody;
      const msg =
        typeof data === "object" && data && "error" in data
          ? String(errObj.error?.message ?? res.statusText)
          : res.statusText;
      throw new WhatsAppCloudError(msg, res.status, data);
    }
    return data;
  }

  /** Postman: Subscribe to your WABA → POST /{WABA-ID}/subscribed_apps */
  subscribeAppToWaba(wabaId: string): Promise<{ success?: boolean }> {
    return this.request("POST", `/${wabaId}/subscribed_apps`, { body: {} }) as Promise<{ success?: boolean }>;
  }

  /** Postman: Get owned WABAs */
  getOwnedWabas(businessPortfolioId: string): Promise<{
    data?: { id: string; name?: string }[];
  }> {
    return this.request("GET", `/${businessPortfolioId}/owned_whatsapp_business_accounts`) as Promise<{
      data?: { id: string; name?: string }[];
    }>;
  }

  /** Postman: Get shared WABAs */
  getSharedWabas(businessPortfolioId: string): Promise<{ data?: { id: string }[] }> {
    return this.request("GET", `/${businessPortfolioId}/client_whatsapp_business_accounts`) as Promise<{
      data?: { id: string }[];
    }>;
  }

  /** Postman: Get Phone Numbers → GET /{WABA-ID}/phone_numbers */
  listPhoneNumbers(wabaId: string): Promise<{
    data?: {
      verified_name: string;
      display_phone_number: string;
      id: string;
      quality_rating: string;
    }[];
  }> {
    return this.request("GET", `/${wabaId}/phone_numbers`) as Promise<{
      data?: {
        verified_name: string;
        display_phone_number: string;
        id: string;
        quality_rating: string;
      }[];
    }>;
  }

  /** Postman: Register Phone Number */
  registerPhone(phoneNumberId: string, pin6: string): Promise<{ success?: string | boolean }> {
    return this.request("POST", `/${phoneNumberId}/register`, {
      body: { messaging_product: "whatsapp", pin: pin6 },
    }) as Promise<{ success?: string | boolean }>;
  }

  /** Postman: Deregister Phone */
  deregisterPhone(phoneNumberId: string): Promise<unknown> {
    return this.request("POST", `/${phoneNumberId}/deregister`, { body: {} });
  }

  /**
   * Postman: Send Text Message, templates, media, etc.
   * POST /{Phone-Number-ID}/messages
   */
  sendMessage(body: Record<string, unknown>): Promise<SendMessageResponse> {
    return this.request("POST", `/${this.phoneNumberId}/messages`, { body }) as Promise<SendMessageResponse>;
  }

  sendTextMessage(
    toE164: string,
    text: string,
    options?: {
      previewUrl?: boolean;
      replyToMessageId?: string;
    },
  ): Promise<SendMessageResponse> {
    const payload: Record<string, unknown> = {
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

  sendTemplateMessage(toE164: string, templateName: string, languageCode: string, components?: unknown[]): Promise<SendMessageResponse> {
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
  markMessageAsRead(wamid: string): Promise<unknown> {
    return this.request("PUT", `/${this.phoneNumberId}/messages`, {
      body: { messaging_product: "whatsapp", status: "read", message_id: wamid },
    });
  }

  /** Postman: Debug Access Token */
  debugToken(inputToken: string): Promise<unknown> {
    return this.request("GET", "/debug_token", { query: { input_token: inputToken } });
  }

  /** Postman: Retrieve Media URL */
  getMediaMetadata(
    mediaId: string,
    phoneNumberId?: string,
  ): Promise<{ url?: string; mime_type?: string; sha256?: string; file_size?: string; id?: string }> {
    const pid = phoneNumberId ?? this.phoneNumberId;
    return this.request("GET", `/${mediaId}`, { query: { phone_number_id: pid } }) as Promise<{
      url?: string;
      mime_type?: string;
      sha256?: string;
      file_size?: string;
      id?: string;
    }>;
  }

  /** Descarga binarios usando la URL temporal (válida ~5 min) + Bearer */
  async downloadMedia(mediaId: string): Promise<{ buffer: ArrayBuffer; mimeType?: string }> {
    const meta = (await this.getMediaMetadata(mediaId)) as { url?: string; mime_type?: string };
    if (!meta.url) throw new Error("La API no devolvió url para el media");
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) throw new WhatsAppCloudError("Fallo al descargar media", res.status, await res.text());
    const buffer = await res.arrayBuffer();
    return { buffer, mimeType: meta.mime_type };
  }

  /**
   * Postman: Upload Image (multipart) → POST /{Phone-Number-ID}/media
   */
  async uploadMediaFile(file: Blob | Buffer, filename: string, mimeType: string): Promise<{ id: string }> {
    const fd = new FormData();
    fd.set("messaging_product", "whatsapp");
    const blob = Buffer.isBuffer(file) ? new Blob([new Uint8Array(file)], { type: mimeType }) : file;
    fd.set("file", blob, filename);
    const url = `${this.base}/${this.phoneNumberId}/media`;
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}` }, body: fd });
    const data = await this.parseJson(res);
    if (!res.ok) {
      const errObj = data as GraphErrorBody;
      const msg =
        typeof data === "object" && data && "error" in data
          ? String(errObj.error?.message ?? res.statusText)
          : res.statusText;
      throw new WhatsAppCloudError(msg, res.status, data);
    }
    return data as { id: string };
  }

  /** Postman: Delete Media */
  deleteMedia(mediaId: string, phoneNumberId?: string): Promise<unknown> {
    const pid = phoneNumberId ?? this.phoneNumberId;
    return this.request("DELETE", `/${mediaId}/`, { query: { phone_number_id: pid }, json: false });
  }
}
