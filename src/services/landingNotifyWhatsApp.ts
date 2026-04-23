import { postSerwpSend } from "./serwpSend.js";

export type LandingContactPayload = {
  name: string;
  company: string;
  phone: string;
  need: string;
  message: string;
};

/** Lista desde .env `NumberListWhats`: solo dígitos, separados por comas. */
export function parseNumberListWhats(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter((n) => n.length >= 10);
}

function buildLandingMessage(p: LandingContactPayload): string {
  const lines = [
    "*Nuevo cliente*",
    "",
    "Hola MASSSIVO tienes un nuevo cliente interesado en adquirir tus productos",
    "",
    `Nombre: ${p.name}`,
    `Empresa: ${p.company}`,
    `WhatsApp: ${p.phone}`,
    `Necesidad: ${p.need}`,
    `Mensaje: ${p.message || "—"}`,
  ];
  return lines.join("\n");
}

/**
 * Encola envío a todos los números vía ser-wp (no bloquea; errores solo en consola).
 */
export function queueLandingNotifyToWhatsApp(serwpSendUrl: string, numberListWhats: string | undefined, payload: LandingContactPayload): void {
  const numbers = parseNumberListWhats(numberListWhats);
  const text = buildLandingMessage(payload);
  if (!numbers.length) {
    console.warn("[landing-notify-wa] NumberListWhats vacío o inválido; no se envía WhatsApp.");
    return;
  }
  void (async () => {
    for (const num of numbers) {
      try {
        await postSerwpSend(serwpSendUrl, num, text);
        console.log("[landing-notify-wa] enviado a", num.replace(/\d(?=\d{4})/g, "*"));
      } catch (e) {
        console.error("[landing-notify-wa] fallo envío a", num, e);
      }
    }
  })();
}
