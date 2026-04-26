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
export declare function initQrInboxStore(uri: string): Promise<void>;
export declare function getQrInboxModels(): {
    QrChat: mongoose.Model<QrInboxChat>;
    QrMessage: mongoose.Model<QrInboxMessage>;
};
export {};
//# sourceMappingURL=qrInboxStore.d.ts.map