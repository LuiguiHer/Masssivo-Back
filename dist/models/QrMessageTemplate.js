import mongoose from "mongoose";
/** Plantillas guardadas para envío masivo vía Baileys/QR (no Meta). */
const qrMessageTemplateSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    contentType: { type: String, required: true, enum: ["text", "image"], trim: true },
    /** Texto del mensaje o cuerpo principal. */
    text: { type: String, trim: true, default: "" },
    /** URL pública o legacy (si no hay objeto en MinIO). Rellenada al leer vía `imageObjectKey` + `MEDIA_PUBLIC_BASE_URL`. */
    imageUrl: { type: String, trim: true, default: "" },
    /** Bucket S3/MinIO (puede quedar vacío: se usa el del microservicio). */
    imageBucket: { type: String, trim: true, default: "" },
    /** Clave del objeto; si está, la imagen está en almacenamiento (masssivo-media). */
    imageObjectKey: { type: String, trim: true, default: "" },
    /** Leyenda opcional bajo la imagen. */
    caption: { type: String, trim: true, default: "" },
    /** Nombre exacto de la plantilla HSM aprobada en Meta (Emisión / Cloud API). Si vacío, se usa `name`. */
    metaTemplateName: { type: String, trim: true, default: "", maxlength: 512 },
    /** Código de idioma Meta (p. ej. es, es_MX). */
    languageCode: { type: String, trim: true, default: "es", maxlength: 32 },
}, { timestamps: true });
qrMessageTemplateSchema.index({ companyId: 1, updatedAt: -1 });
qrMessageTemplateSchema.index({ companyId: 1, name: 1 });
export const QrMessageTemplate = mongoose.models.QrMessageTemplate ||
    mongoose.model("QrMessageTemplate", qrMessageTemplateSchema, "wapi_qr_message_templates");
//# sourceMappingURL=QrMessageTemplate.js.map