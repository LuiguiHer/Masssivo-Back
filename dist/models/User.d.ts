import mongoose from "mongoose";
declare const userSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    name: string;
    email: string;
    status: "active" | "disabled";
    whatsapp: string;
    role: "owner";
    companyId?: mongoose.Types.ObjectId | null | undefined;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    name: string;
    email: string;
    status: "active" | "disabled";
    whatsapp: string;
    role: "owner";
    companyId?: mongoose.Types.ObjectId | null | undefined;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    name: string;
    email: string;
    status: "active" | "disabled";
    whatsapp: string;
    role: "owner";
    companyId?: mongoose.Types.ObjectId | null | undefined;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type UserDoc = mongoose.InferSchemaType<typeof userSchema>;
export declare const User: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=User.d.ts.map