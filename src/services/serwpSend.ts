import { createHash, randomInt } from "node:crypto";

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateNumericOtp6(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normalizeDigits(input: string): string {
  return String(input ?? "").replace(/\D/g, "");
}

function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else break;
  }
  return parts.join(" | ");
}

export async function postSerwpSend(sendUrl: string, numberDigits: string, message: string): Promise<void> {
  const payload = JSON.stringify({ number: numberDigits, message });
  async function doPost(url: string) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ser-wp send falló (${res.status}): ${text.slice(0, 500)}`);
  }

  try {
    await doPost(sendUrl);
  } catch (e) {
    // HTTPS a un puerto que sirve HTTP plano: Node suele envolver el fallo en TypeError("fetch failed") + cause SSL.
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
