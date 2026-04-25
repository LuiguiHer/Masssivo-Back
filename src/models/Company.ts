import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    nit: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, trim: true },
    legalName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    /** Salida: Cloud API (Meta) o microservicio Baileys (QR). Por defecto Meta. */
    outboundChannel: {
      type: String,
      enum: ["cloud_api", "qr_baileys"],
      default: "cloud_api",
    },
  },
  { timestamps: true },
);

companySchema.index({ legalName: 1 });

export type CompanyDoc = mongoose.InferSchemaType<typeof companySchema>;
export const Company = mongoose.models.Company || mongoose.model("Company", companySchema, "wapi_send_companies");
