import mongoose from "mongoose";
declare const companySchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    email: string;
    phone: string;
    nit: string;
    legalName: string;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    email: string;
    phone: string;
    nit: string;
    legalName: string;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    email: string;
    phone: string;
    nit: string;
    legalName: string;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type CompanyDoc = mongoose.InferSchemaType<typeof companySchema>;
export declare const Company: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=Company.d.ts.map