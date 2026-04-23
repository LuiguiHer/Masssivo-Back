export type LandingContactPayload = {
    name: string;
    company: string;
    phone: string;
    need: string;
    message: string;
};
/** Lista desde .env `NumberListWhats`: solo dígitos, separados por comas. */
export declare function parseNumberListWhats(raw: string | undefined): string[];
/**
 * Encola envío a todos los números vía ser-wp (no bloquea; errores solo en consola).
 */
export declare function queueLandingNotifyToWhatsApp(serwpSendUrl: string, numberListWhats: string | undefined, payload: LandingContactPayload): void;
//# sourceMappingURL=landingNotifyWhatsApp.d.ts.map