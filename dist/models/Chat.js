import mongoose from "mongoose";
const chatSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    waId: { type: String, required: true },
    displayName: { type: String },
    lastMessageAt: { type: Date, required: true },
    lastMessagePreview: { type: String, default: "" },
    unreadCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
chatSchema.index({ companyId: 1, waId: 1 }, { unique: true });
chatSchema.index({ companyId: 1, lastMessageAt: -1 });
export const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema, "wapi_inbox_chats");
//# sourceMappingURL=Chat.js.map