import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    whatsapp: { type: String, required: true, unique: true }, // dígitos E164 sin '+'
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: false, index: true },
    role: { type: String, enum: ["owner"], default: "owner" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
  },
  { timestamps: true },
);

userSchema.index({ companyId: 1, email: 1 });

export type UserDoc = mongoose.InferSchemaType<typeof userSchema>;
export const User = mongoose.models.User || mongoose.model("User", userSchema, "wapi_send_users");
