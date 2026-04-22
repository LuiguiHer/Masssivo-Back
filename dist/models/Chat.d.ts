import mongoose from "mongoose";
declare const chatSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    companyId: mongoose.Types.ObjectId;
    waId: string;
    lastMessageAt: NativeDate;
    lastMessagePreview: string;
    unreadCount: number;
    displayName?: string | null | undefined;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    waId: string;
    lastMessageAt: NativeDate;
    lastMessagePreview: string;
    unreadCount: number;
    displayName?: string | null | undefined;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    waId: string;
    lastMessageAt: NativeDate;
    lastMessagePreview: string;
    unreadCount: number;
    displayName?: string | null | undefined;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type ChatDoc = mongoose.InferSchemaType<typeof chatSchema>;
/** Colección en BD `serwp` (mismo usuario Mongo que serWP) para no requerir roles extra. */
export declare const Chat: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=Chat.d.ts.map