import mongoose from "mongoose";
declare const otpChallengeSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    purpose: "login" | "register";
    whatsapp: string;
    codeHash: string;
    attemptsLeft: number;
    expiresAt: NativeDate;
    consumedAt?: NativeDate | null | undefined;
    registerDraft?: any;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    purpose: "login" | "register";
    whatsapp: string;
    codeHash: string;
    attemptsLeft: number;
    expiresAt: NativeDate;
    consumedAt?: NativeDate | null | undefined;
    registerDraft?: any;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    purpose: "login" | "register";
    whatsapp: string;
    codeHash: string;
    attemptsLeft: number;
    expiresAt: NativeDate;
    consumedAt?: NativeDate | null | undefined;
    registerDraft?: any;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type OtpChallengeDoc = mongoose.InferSchemaType<typeof otpChallengeSchema>;
export declare const OtpChallenge: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=OtpChallenge.d.ts.map