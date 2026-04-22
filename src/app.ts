import cors from "cors";
import type { Express } from "express";
import express from "express";
import { createInboxRouter } from "./routes/inboxApi.js";
import { createSendApiRouter } from "./routes/sendApi.js";
import { createWebhookRouter } from "./webhookRouter.js";

export type CreateAppOptions = {
  webhookVerifyToken?: string;
  checkWebhookVerifyToken?: (token: string) => Promise<boolean>;
  onWebhookVerifySuccess?: (token: string) => Promise<void> | void;
  onWebhook?: (body: unknown) => void;
  sendJwtSecret: string;
  serwpSendUrl: string;
};

export function createApp(opts: CreateAppOptions): Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    "/api/send",
    createSendApiRouter({
      jwtSecret: opts.sendJwtSecret,
      serwpSendUrl: opts.serwpSendUrl,
    }),
  );

  app.use("/inbox/v1", createInboxRouter(opts.sendJwtSecret));

  app.use(
    createWebhookRouter(
      opts.webhookVerifyToken,
      opts.onWebhook,
      opts.checkWebhookVerifyToken,
      opts.onWebhookVerifySuccess,
    ),
  );

  return app;
}
