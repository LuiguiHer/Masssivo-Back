/**
 * Uso: WA_ACCESS_TOKEN=... WA_PHONE_NUMBER_ID=... GRAPH_API_VERSION=v21.0 npx tsx src/cli/sendText.ts <E164> <mensaje>
 * Ejemplo: ... tsx src/cli/sendText.ts 5215512345678 "Hola desde Cloud API"
 */
import "dotenv/config";
import { WhatsAppCloudClient } from "../whatsappCloudClient.js";

const to = process.argv[2];
const text = process.argv[3];
if (!to || !text) {
  console.error("Uso: tsx src/cli/sendText.ts <numero_E164_sin_+> <mensaje>");
  process.exit(1);
}

const accessToken = process.env.WA_ACCESS_TOKEN;
const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
const version = process.env.GRAPH_API_VERSION ?? "v21.0";

if (!accessToken || !phoneNumberId) {
  console.error("Definí WA_ACCESS_TOKEN y WA_PHONE_NUMBER_ID en .env");
  process.exit(1);
}

const client = new WhatsAppCloudClient(accessToken, version, phoneNumberId);
const out = await client.sendTextMessage(to, text);
console.log(JSON.stringify(out, null, 2));
