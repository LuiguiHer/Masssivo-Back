import mongoose from "mongoose";
/** Archivo de muestra para plantillas (HEADER multimedia): servido por HTTPS para Meta (`header_handle`). */
declare const templateSampleUploadSchema: mongoose.Schema<any, mongoose.Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    companyId: mongoose.Types.ObjectId;
    data: Buffer<ArrayBufferLike>;
    token: string;
    mimeType: string;
    originalName?: string | null | undefined;
} & mongoose.DefaultTimestampProps, mongoose.Document<unknown, {}, mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    data: Buffer<ArrayBufferLike>;
    token: string;
    mimeType: string;
    originalName?: string | null | undefined;
} & mongoose.DefaultTimestampProps>, {}, mongoose.MergeType<mongoose.DefaultSchemaOptions, {
    timestamps: true;
}>> & mongoose.FlatRecord<{
    companyId: mongoose.Types.ObjectId;
    data: Buffer<ArrayBufferLike>;
    token: string;
    mimeType: string;
    originalName?: string | null | undefined;
} & mongoose.DefaultTimestampProps> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
export type TemplateSampleUploadDoc = mongoose.InferSchemaType<typeof templateSampleUploadSchema>;
export declare const TemplateSampleUpload: mongoose.Model<any, {}, {}, {}, any, any>;
export {};
//# sourceMappingURL=TemplateSampleUpload.d.ts.map