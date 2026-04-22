import mongoose from "mongoose";
declare const clientSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    companyId: mongoose.Types.ObjectId;
    name: string;
    phone: string;
    notes: string;
    status: "active" | "inactive";
    email?: string | null | undefined;
    companyName?: string | null | undefined;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    name: string;
    phone: string;
    notes: string;
    status: "active" | "inactive";
    email?: string | null | undefined;
    companyName?: string | null | undefined;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    name: string;
    phone: string;
    notes: string;
    status: "active" | "inactive";
    email?: string | null | undefined;
    companyName?: string | null | undefined;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type ClientDoc = mongoose.InferSchemaType<typeof clientSchema>;
export declare const Client: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=Client.d.ts.map