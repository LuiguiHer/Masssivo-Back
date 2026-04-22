import mongoose from "mongoose";

const uploadedMediaSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    mediaId: { type: String, required: true, trim: true, index: true },
    label: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    originalName: { type: String, trim: true },
  },
  { timestamps: true },
);

uploadedMediaSchema.index({ companyId: 1, createdAt: -1 });

export const UploadedMedia =
  mongoose.models.UploadedMedia || mongoose.model("UploadedMedia", uploadedMediaSchema, "wapi_uploaded_media");

