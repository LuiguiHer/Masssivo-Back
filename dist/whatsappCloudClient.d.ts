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
export declare class WhatsAppCloudError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(message: string, status: number, body: unknown);
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
export declare class WhatsAppCloudClient {
    private readonly accessToken;
    private readonly graphVersion;
    private readonly phoneNumberId;
    private readonly base;
    constructor(accessToken: string, graphVersion: string, phoneNumberId: string);
    get phoneId(): string;
    private authHeaders;
    private parseJson;
    private request;
    /** Postman: Subscribe to your WABA → POST /{WABA-ID}/subscribed_apps */
    subscribeAppToWaba(wabaId: string): Promise<{
        success?: boolean;
    }>;
    /** Postman: Get owned WABAs */
    getOwnedWabas(businessPortfolioId: string): Promise<{
        data?: {
            id: string;
            name?: string;
        }[];
    }>;
    /** Postman: Get shared WABAs */
    getSharedWabas(businessPortfolioId: string): Promise<{
        data?: {
            id: string;
        }[];
    }>;
    /** Postman: Get Phone Numbers → GET /{WABA-ID}/phone_numbers */
    listPhoneNumbers(wabaId: string): Promise<{
        data?: {
            verified_name: string;
            display_phone_number: string;
            id: string;
            quality_rating: string;
        }[];
    }>;
    /** Postman: Register Phone Number */
    registerPhone(phoneNumberId: string, pin6: string): Promise<{
        success?: string | boolean;
    }>;
    /** Postman: Deregister Phone */
    deregisterPhone(phoneNumberId: string): Promise<unknown>;
    /**
     * Postman: Send Text Message, templates, media, etc.
     * POST /{Phone-Number-ID}/messages
     */
    sendMessage(body: Record<string, unknown>): Promise<SendMessageResponse>;
    sendTextMessage(toE164: string, text: string, options?: {
        previewUrl?: boolean;
        replyToMessageId?: string;
    }): Promise<SendMessageResponse>;
    sendTemplateMessage(toE164: string, templateName: string, languageCode: string, components?: unknown[]): Promise<SendMessageResponse>;
    /** Postman: Mark Message As Read → PUT /{Phone-Number-ID}/messages */
    markMessageAsRead(wamid: string): Promise<unknown>;
    /** Postman: Debug Access Token */
    debugToken(inputToken: string): Promise<unknown>;
    /** Postman: Retrieve Media URL */
    getMediaMetadata(mediaId: string, phoneNumberId?: string): Promise<{
        url?: string;
        mime_type?: string;
        sha256?: string;
        file_size?: string;
        id?: string;
    }>;
    /** Descarga binarios usando la URL temporal (válida ~5 min) + Bearer */
    downloadMedia(mediaId: string): Promise<{
        buffer: ArrayBuffer;
        mimeType?: string;
    }>;
    /**
     * Postman: Upload Image (multipart) → POST /{Phone-Number-ID}/media
     */
    uploadMediaFile(file: Blob | Buffer, filename: string, mimeType: string): Promise<{
        id: string;
    }>;
    /** Postman: Delete Media */
    deleteMedia(mediaId: string, phoneNumberId?: string): Promise<unknown>;
}
//# sourceMappingURL=whatsappCloudClient.d.ts.map