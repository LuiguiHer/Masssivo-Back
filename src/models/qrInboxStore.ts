import mongoose from "mongoose";

type QrInboxChat = {
  companyId: mongoose.Schema.Types.ObjectId;
  waId: string;
  displayName?: string;
  lastMessageAt: Date;
  lastMessagePreview?: string;
  unreadCount?: number;
};

type QrInboxMessage = {
  companyId: mongoose.Schema.Types.ObjectId;
  waId: string;
  wamid: string;
  direction: "in" | "out";
  type: string;
  bodyText?: string;
  payload?: unknown;
  timestamp: Date;
  deliveryStatus?: string;
  deliveryErrors?: unknown;
  deliveryUpdatedAt?: Date;
};

let qrConn: mongoose.Connection | null = null;
let QrInboxChatModel: mongoose.Model<QrInboxChat> | null = null;
let QrInboxMessageModel: mongoose.Model<QrInboxMessage> | null = null;

const chatSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    waId: { type: String, required: true },
    displayName: { type: String },
    lastMessageAt: { type: Date, required: true },
    lastMessagePreview: { type: String, default: "" },
    unreadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
chatSchema.index({ companyId: 1, waId: 1 }, { unique: true });
chatSchema.index({ companyId: 1, lastMessageAt: -1 });

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
    deliveryStatus: { type: String },
    deliveryErrors: { type: mongoose.Schema.Types.Mixed },
    deliveryUpdatedAt: { type: Date },
  },
  { timestamps: true },
);
messageSchema.index({ companyId: 1, waId: 1, createdAt: -1 });
messageSchema.index({ companyId: 1, wamid: 1 }, { unique: true });

export async function initQrInboxStore(uri: string): Promise<void> {
  if (qrConn && QrInboxChatModel && QrInboxMessageModel) return;
  qrConn = await mongoose.createConnection(uri).asPromise();
  QrInboxChatModel = qrConn.model<QrInboxChat>("QrInboxChat", chatSchema, "wapi_inbox_qr_chats");
  QrInboxMessageModel = qrConn.model<QrInboxMessage>("QrInboxMessage", messageSchema, "wapi_inbox_qr_messages");
}

export function getQrInboxModels(): {
  QrChat: mongoose.Model<QrInboxChat>;
  QrMessage: mongoose.Model<QrInboxMessage>;
} {
  if (!QrInboxChatModel || !QrInboxMessageModel) {
    throw new Error("QR inbox store no inicializado. Llama initQrInboxStore() al arrancar.");
  }
  return { QrChat: QrInboxChatModel, QrMessage: QrInboxMessageModel };
}

