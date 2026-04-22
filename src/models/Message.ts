import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    waId: { type: String, required: true, index: true },
    wamid: { type: String, required: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    type: { type: String, required: true },
    bodyText: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, required: true },
    /** Actualizaciones del webhook `statuses` (sent / delivered / read / failed) */
    deliveryStatus: { type: String },
    deliveryErrors: { type: mongoose.Schema.Types.Mixed },
    deliveryUpdatedAt: { type: Date },
  },
  { timestamps: true },
);

messageSchema.index({ companyId: 1, waId: 1, createdAt: -1 });
messageSchema.index({ companyId: 1, wamid: 1 }, { unique: true });

export const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema, "wapi_inbox_messages");
