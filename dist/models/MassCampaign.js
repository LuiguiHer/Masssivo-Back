import mongoose from "mongoose";
const massCampaignSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  name: { type: String, required: true, trim: true },
  fileName: { type: String, trim: true },
  phoneColumn: { type: String, required: true, trim: true },
  templateName: { type: String, required: true, trim: true },
  languageCode: { type: String, required: true, trim: true },
  variableMapping: { type: mongoose.Schema.Types.Mixed },
  headerImageMode: { type: String, enum: ["url", "mediaId"], trim: true },
  headerImageUrl: { type: String, trim: true },
  headerImageMediaId: { type: String, trim: true },
  intervalSec: { type: Number, required: true, min: 1, max: 300 },
  rowCount: { type: Number, required: true, min: 0 },
  sentCount: { type: Number, default: 0, min: 0 },
  failCount: { type: Number, default: 0, min: 0 },
  deliveredCount: { type: Number, default: 0, min: 0 },
  deliveryFailedCount: { type: Number, default: 0, min: 0 },
  pendingDeliveryCount: { type: Number, default: 0, min: 0 },
  rowResults: {
    type: [
      {
        rowIndex: { type: Number, required: true, min: 1 },
        phone: { type: String, trim: true },
        wamid: { type: String, trim: true },
        apiOk: { type: Boolean },
        deliveryStatus: { type: String, trim: true },
        ok: { type: Boolean },
        reason: { type: String, trim: true },
        deliveryUpdatedAt: { type: Date }
      }
    ],
    default: void 0
  },
  status: { type: String, default: "draft", enum: ["draft", "sent"] }
}, { timestamps: true });
massCampaignSchema.index({ companyId: 1, createdAt: -1 });
const MassCampaign = mongoose.models.MassCampaign || mongoose.model("MassCampaign", massCampaignSchema, "wapi_mass_campaigns");
export {
  MassCampaign
};

