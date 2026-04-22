import type { NextFunction, Request, Response } from "express";
export type AuthedRequest = Request & {
    auth?: {
        userId: string;
        companyId?: string;
    };
};
export declare function requireAuth(jwtSecret: string): (req: AuthedRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
//# sourceMappingURL=requireAuth.d.ts.map