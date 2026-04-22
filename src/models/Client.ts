import mongoose from "mongoose";

const clientSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

clientSchema.index({ companyId: 1, phone: 1 });
clientSchema.index({ companyId: 1, email: 1 });

export type ClientDoc = mongoose.InferSchemaType<typeof clientSchema>;
export const Client = mongoose.models.Client || mongoose.model("Client", clientSchema, "wapi_send_clients");
