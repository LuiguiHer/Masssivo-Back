import mongoose from "mongoose";

const companyWhatsappConfigSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    waAccessToken: { type: String, required: true },
    graphApiVersion: { type: String, required: true, trim: true, default: "v21.0" },
    waPhoneNumberId: { type: String, required: true, trim: true, unique: true },
    /** App ID en Meta (para Resumable Upload API: muestras de plantillas IMAGE/VIDEO/DOCUMENT). */
    waMetaAppId: { type: String, trim: true },
    waWabaId: { type: String, trim: true },
    waBusinessId: { type: String, trim: true },
    /** Plantilla por defecto para reabrir conversación (caso 131047). */
    messageStartTemplate: {
      templateLabel: { type: String, trim: true, default: "inicio_conversacion" },
      metaTemplateId: { type: String, trim: true },
      templateName: { type: String, trim: true },
      languageCode: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

companyWhatsappConfigSchema.index({ companyId: 1 }, { unique: true });

export type CompanyWhatsappConfigDoc = mongoose.InferSchemaType<typeof companyWhatsappConfigSchema>;
export const CompanyWhatsappConfig =
  mongoose.models.CompanyWhatsappConfig ||
  mongoose.model("CompanyWhatsappConfig", companyWhatsappConfigSchema, "wapi_send_company_whatsapp_configs");
