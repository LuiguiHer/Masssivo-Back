import mongoose from "mongoose";
const otpChallengeSchema = new mongoose.Schema({
    purpose: { type: String, enum: ["login", "register"], required: true, index: true },
    whatsapp: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    attemptsLeft: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date },
    /** Para registro: payload serializado (empresa + usuario) hasta verificar */
    registerDraft: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });
otpChallengeSchema.index({ purpose: 1, whatsapp: 1, expiresAt: -1 });
export const OtpChallenge = mongoose.models.OtpChallenge || mongoose.model("OtpChallenge", otpChallengeSchema, "wapi_send_otp_challenges");
//# sourceMappingURL=OtpChallenge.js.map