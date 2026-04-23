import { createHash, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export function hashOtpCode(code) {
    return createHash("sha256").update(code).digest("hex");
}
export function generateNumericOtp6() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
export function normalizeDigits(input) {
    return String(input ?? "").replace(/\D/g, "");
}
/**
 * Texto con formato WhatsApp: *negrita*, _cursiva_.
 * Imagen (si ser-wp la admite) + este texto como cuerpo/caption.
 */
export function buildOtpAccessCaption(code) {
    return `*MASSSIVO*

Codigo de Acceso:
_${code}_

Expira en 5 minutos. Tienes hasta 3 intentos.`;
}
export function buildOtpRegisterCaption(code) {
    return `*MASSSIVO*

Codigo de Registro:
_${code}_

Expira en 5 minutos. Tienes hasta 3 intentos.`;
}
function collectErrorText(err) {
    const parts = [];
    let cur = err;
    for (let i = 0; i < 6 && cur; i++) {
        if (cur instanceof Error) {
            parts.push(cur.message);
            cur = cur.cause;
        }
        else
            break;
    }
    return parts.join(" | ");
}
async function postSerwpPayload(sendUrl, payload) {
    const body = JSON.stringify(payload);
    async function doPost(url) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });
        const text = await res.text();
        if (!res.ok)
            throw new Error(`ser-wp send falló (${res.status}): ${text.slice(0, 500)}`);
    }
    try {
        await doPost(sendUrl);
    }
    catch (e) {
        const combined = collectErrorText(e);
        const isSslMismatch = /ERR_SSL_PACKET_LENGTH_TOO_LONG|SSL routines|packet length too long/i.test(combined);
        if (isSslMismatch && /^https:\/\/127\.0\.0\.1(?::\d+)?\//.test(sendUrl)) {
            const fallback = sendUrl.replace(/^https:/, "http:");
            await doPost(fallback);
            return;
        }
        throw e;
    }
}
export async function postSerwpSend(sendUrl, numberDigits, message) {
    await postSerwpPayload(sendUrl, { number: numberDigits, message });
}
/**
 * OTP con imagen ISO + pie de mensaje, solo vía ser-wp.
 * Payload extendido: `imageBase64`, `imageMimeType`, `imageFileName` (el servicio ser-wp debe enviar
 * la imagen y debajo el `message` como caption o mensaje de texto).
 */
export async function postSerwpSendOtpWithImage(sendUrl, numberDigits, message) {
    const dir = dirname(fileURLToPath(import.meta.url));
    const imagePath = join(dir, "../assets/iso_masssivo_little.PNG");
    let imageBase64;
    try {
        const buf = await readFile(imagePath);
        imageBase64 = buf.toString("base64");
    }
    catch (e) {
        console.error("[ser-wp/otp] no se pudo leer la imagen ISO, se envía solo texto:", e);
        await postSerwpSend(sendUrl, numberDigits, message);
        return;
    }
    await postSerwpPayload(sendUrl, {
        number: numberDigits,
        message,
        imageBase64,
        imageMimeType: "image/png",
        imageFileName: "iso_masssivo_little.PNG",
    });
}
//# sourceMappingURL=serwpSend.js.map