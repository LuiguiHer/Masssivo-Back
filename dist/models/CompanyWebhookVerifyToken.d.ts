import mongoose from "mongoose";
declare const companyWebhookVerifyTokenSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    companyId: mongoose.Types.ObjectId;
    token: string;
    verifiedAt?: NativeDate | null | undefined;
    liveTestPassedAt?: NativeDate | null | undefined;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    token: string;
    verifiedAt?: NativeDate | null | undefined;
    liveTestPassedAt?: NativeDate | null | undefined;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    token: string;
    verifiedAt?: NativeDate | null | undefined;
    liveTestPassedAt?: NativeDate | null | undefined;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type CompanyWebhookVerifyTokenDoc = mongoose.InferSchemaType<typeof companyWebhookVerifyTokenSchema>;
export declare const CompanyWebhookVerifyToken: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=CompanyWebhookVerifyToken.d.ts.map