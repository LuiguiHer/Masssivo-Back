import { Router } from "express";

type VerifyTokenChecker = (token: string) => Promise<boolean>;
type VerifyTokenSuccessHandler = (token: string) => Promise<void> | void;

/**
 * Verificación webhook Meta (GET) y recepción de eventos (POST).
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function createWebhookRouter(
  verifyToken: string | undefined,
  onPayload?: (body: unknown) => void,
  checkVerifyToken?: VerifyTokenChecker,
  onVerifyTokenSuccess?: VerifyTokenSuccessHandler,
): Router {
  const r = Router();

  r.get("/webhook", async (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && typeof token === "string" && typeof challenge === "string") {
      const validByEnv = Boolean(verifyToken && token === verifyToken);
      const validByDb = checkVerifyToken ? await checkVerifyToken(token) : false;
      if (validByEnv || validByDb) {
        try {
          await onVerifyTokenSuccess?.(token);
        } catch (e) {
          console.error("[webhook] verify success hook error", e);
        }
        res.status(200).send(challenge);
        return;
      }
    }
    res.sendStatus(403);
  });

  r.post("/webhook", (req, res) => {
    try {
      onPayload?.(req.body);
    } catch (e) {
      console.error("[webhook] handler error", e);
    }
    res.sendStatus(200);
  });

  return r;
}
