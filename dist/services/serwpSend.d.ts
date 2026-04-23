export declare function hashOtpCode(code: string): string;
export declare function generateNumericOtp6(): string;
export declare function normalizeDigits(input: string): string;
/**
 * Texto con formato WhatsApp: *negrita*, _cursiva_.
 * Imagen (si ser-wp la admite) + este texto como cuerpo/caption.
 */
export declare function buildOtpAccessCaption(code: string): string;
export declare function buildOtpRegisterCaption(code: string): string;
export declare function postSerwpSend(sendUrl: string, numberDigits: string, message: string): Promise<void>;
/**
 * OTP con imagen ISO + pie de mensaje, solo vía ser-wp.
 * Payload extendido: `imageBase64`, `imageMimeType`, `imageFileName` (el servicio ser-wp debe enviar
 * la imagen y debajo el `message` como caption o mensaje de texto).
 */
export declare function postSerwpSendOtpWithImage(sendUrl: string, numberDigits: string, message: string): Promise<void>;
//# sourceMappingURL=serwpSend.d.ts.map