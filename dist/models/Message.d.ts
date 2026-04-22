import mongoose from "mongoose";
declare const messageSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    companyId: mongoose.Types.ObjectId;
    type: string;
    waId: string;
    wamid: string;
    direction: "out" | "in";
    timestamp: NativeDate;
    bodyText?: string | null | undefined;
    payload?: any;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    type: string;
    waId: string;
    wamid: string;
    direction: "out" | "in";
    timestamp: NativeDate;
    bodyText?: string | null | undefined;
    payload?: any;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    type: string;
    waId: string;
    wamid: string;
    direction: "out" | "in";
    timestamp: NativeDate;
    bodyText?: string | null | undefined;
    payload?: any;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type MessageDoc = mongoose.InferSchemaType<typeof messageSchema>;
export declare const Message: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=Message.d.ts.map