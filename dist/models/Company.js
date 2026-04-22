import mongoose from "mongoose";
const companySchema = new mongoose.Schema({
    nit: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, trim: true },
    legalName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
}, { timestamps: true });
companySchema.index({ legalName: 1 });
export const Company = mongoose.models.Company || mongoose.model("Company", companySchema, "wapi_send_companies");
//# sourceMappingURL=Company.js.map