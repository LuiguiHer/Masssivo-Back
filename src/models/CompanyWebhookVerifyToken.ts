import mongoose from "mongoose";

const companyWebhookVerifyTokenSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    token: { type: String, required: true, unique: true, trim: true },
    verifiedAt: { type: Date },
    /** Prueba en vivo del flujo webhook (mensaje entrante capturado durante «Iniciar prueba»). */
    liveTestPassedAt: { type: Date },
  },
  { timestamps: true },
);

companyWebhookVerifyTokenSchema.index({ companyId: 1 }, { unique: true });
companyWebhookVerifyTokenSchema.index({ token: 1 }, { unique: true });

export type CompanyWebhookVerifyTokenDoc = mongoose.InferSchemaType<typeof companyWebhookVerifyTokenSchema>;
export const CompanyWebhookVerifyToken =
  mongoose.models.CompanyWebhookVerifyToken ||
  mongoose.model("CompanyWebhookVerifyToken", companyWebhookVerifyTokenSchema, "wapi_send_company_webhook_verify_tokens");
