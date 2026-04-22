import jwt from "jsonwebtoken";
export function requireAuth(jwtSecret) {
    return (req, res, next) => {
        const hdr = req.header("authorization") ?? "";
        const m = /^Bearer\s+(.+)$/i.exec(hdr);
        const token = m?.[1];
        if (!token)
            return res.status(401).json({ error: "Falta token Bearer" });
        try {
            const payload = jwt.verify(token, jwtSecret);
            if (!payload.sub)
                return res.status(401).json({ error: "Token inválido" });
            req.auth = { userId: payload.sub, ...(payload.companyId ? { companyId: payload.companyId } : {}) };
            return next();
        }
        catch {
            return res.status(401).json({ error: "Token inválido o expirado" });
        }
    };
}
//# sourceMappingURL=requireAuth.js.map