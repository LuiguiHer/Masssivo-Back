"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const clientSchema = new mongoose_1.default.Schema({
    companyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
}, { timestamps: true });
clientSchema.index({ companyId: 1, phone: 1 });
clientSchema.index({ companyId: 1, email: 1 });
exports.Client = mongoose_1.default.models.Client || mongoose_1.default.model("Client", clientSchema, "wapi_send_clients");
