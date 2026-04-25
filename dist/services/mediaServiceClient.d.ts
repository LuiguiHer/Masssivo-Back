export type MediaUploadResult = {
    bucket: string;
    key: string;
    publicUrl: string;
};
/**
 * Sube al microservicio masssivo-media usando FormData _nativo_ + fetch.
 * El paquete `form-data` + `fetch` de Node (undici) genera body multipart truncado → "Unexpected end of form" en el receptor.
 */
export declare function uploadFileToMediaService(baseUrl: string, internalKey: string, localPath: string, companyId: string, originalName: string, mimetype: string): Promise<MediaUploadResult>;
export declare function deleteObjectFromMediaService(baseUrl: string, internalKey: string, key: string): Promise<void>;
//# sourceMappingURL=mediaServiceClient.d.ts.map