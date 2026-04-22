import { Router } from "express";
type SendApiDeps = {
    jwtSecret: string;
    serwpSendUrl: string;
};
export declare function createSendApiRouter(deps: SendApiDeps): Router;
export {};
//# sourceMappingURL=sendApi.d.ts.map