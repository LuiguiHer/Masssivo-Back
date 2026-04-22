import mongoose from "mongoose";
declare const companyWhatsappConfigSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    companyId: mongoose.Types.ObjectId;
    waAccessToken: string;
    graphApiVersion: string;
    waPhoneNumberId: string;
    waMetaAppId?: string | null | undefined;
    waWabaId?: string | null | undefined;
    waBusinessId?: string | null | undefined;
    messageStartTemplate?: {
        templateLabel: string;
        metaTemplateId?: string | null | undefined;
        templateName?: string | null | undefined;
        languageCode?: string | null | undefined;
    } | null | undefined;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    waAccessToken: string;
    graphApiVersion: string;
    waPhoneNumberId: string;
    waMetaAppId?: string | null | undefined;
    waWabaId?: string | null | undefined;
    waBusinessId?: string | null | undefined;
    messageStartTemplate?: {
        templateLabel: string;
        metaTemplateId?: string | null | undefined;
        templateName?: string | null | undefined;
        languageCode?: string | null | undefined;
    } | null | undefined;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    waAccessToken: string;
    graphApiVersion: string;
    waPhoneNumberId: string;
    waMetaAppId?: string | null | undefined;
    waWabaId?: string | null | undefined;
    waBusinessId?: string | null | undefined;
    messageStartTemplate?: {
        templateLabel: string;
        metaTemplateId?: string | null | undefined;
        templateName?: string | null | undefined;
        languageCode?: string | null | undefined;
    } | null | undefined;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type CompanyWhatsappConfigDoc = mongoose.InferSchemaType<typeof companyWhatsappConfigSchema>;
export declare const CompanyWhatsappConfig: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=CompanyWhatsappConfig.d.ts.map