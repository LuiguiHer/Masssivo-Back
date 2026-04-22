import mongoose from "mongoose";
const templateSampleUploadSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  mimeType: { type: String, trim: true, required: true },
  originalName: { type: String, trim: true },
  data: { type: Buffer, required: true },
}, { timestamps: true });
templateSampleUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
const TemplateSampleUpload = mongoose.models.TemplateSampleUpload ||
  mongoose.model("TemplateSampleUpload", templateSampleUploadSchema, "wapi_template_sample_uploads");
export {
  TemplateSampleUpload
};
