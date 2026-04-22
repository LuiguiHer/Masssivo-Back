"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyWhatsappConfig = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const companyWhatsappConfigSchema = new mongoose_1.default.Schema({
    companyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    waAccessToken: { type: String, required: true },
    graphApiVersion: { type: String, required: true, trim: true, default: "v21.0" },
    waPhoneNumberId: { type: String, required: true, trim: true, unique: true },
    waMetaAppId: { type: String, trim: true },
    waWabaId: { type: String, trim: true },
    waBusinessId: { type: String, trim: true },
    messageStartTemplate: {
        templateLabel: { type: String, trim: true, default: "inicio_conversacion" },
        metaTemplateId: { type: String, trim: true },
        templateName: { type: String, trim: true },
        languageCode: { type: String, trim: true },
    },
}, { timestamps: true });
companyWhatsappConfigSchema.index({ companyId: 1 }, { unique: true });
exports.CompanyWhatsappConfig = mongoose_1.default.models.CompanyWhatsappConfig ||
    mongoose_1.default.model("CompanyWhatsappConfig", companyWhatsappConfigSchema, "wapi_send_company_whatsapp_configs");
