import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthedRequest = Request & {
  auth?: { userId: string; companyId?: string };
};

export function requireAuth(jwtSecret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const hdr = req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(hdr);
    const token = m?.[1];
    if (!token) return res.status(401).json({ error: "Falta token Bearer" });
    try {
      const payload = jwt.verify(token, jwtSecret) as { sub?: string; companyId?: string };
      if (!payload.sub) return res.status(401).json({ error: "Token inválido" });
      req.auth = { userId: payload.sub, ...(payload.companyId ? { companyId: payload.companyId } : {}) };
      return next();
    } catch {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
  };
}
