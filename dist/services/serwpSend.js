import { createHash, randomInt } from "node:crypto";
export function hashOtpCode(code) {
    return createHash("sha256").update(code).digest("hex");
}
export function generateNumericOtp6() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
export function normalizeDigits(input) {
    return String(input ?? "").replace(/\D/g, "");
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
export async function postSerwpSend(sendUrl, numberDigits, message) {
    const payload = JSON.stringify({ number: numberDigits, message });
    async function doPost(url) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
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
//# sourceMappingURL=serwpSend.js.map