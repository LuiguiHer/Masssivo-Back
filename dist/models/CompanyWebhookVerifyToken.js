"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyWebhookVerifyToken = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const companyWebhookVerifyTokenSchema = new mongoose_1.default.Schema({
    companyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    token: { type: String, required: true, unique: true, trim: true },
    verifiedAt: { type: Date },
    /** Prueba en vivo del flujo webhook (mensaje entrante capturado durante «Iniciar prueba»). */
    liveTestPassedAt: { type: Date },
}, { timestamps: true });
companyWebhookVerifyTokenSchema.index({ companyId: 1 }, { unique: true });
companyWebhookVerifyTokenSchema.index({ token: 1 }, { unique: true });
exports.CompanyWebhookVerifyToken = mongoose_1.default.models.CompanyWebhookVerifyToken ||
    mongoose_1.default.model("CompanyWebhookVerifyToken", companyWebhookVerifyTokenSchema, "wapi_send_company_webhook_verify_tokens");
