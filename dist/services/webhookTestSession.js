/** Sesión en memoria: usuario pulsa «Iniciar prueba» hasta que llega el primer mensaje al webhook o cancela. */
const activeByCompany = new Map();
/** Máximo que una sesión de prueba puede permanecer activa (seguridad). */
const SESSION_MAX_MS = 2 * 60 * 60 * 1000;
export function startLiveTest(companyId) {
    activeByCompany.set(String(companyId), Date.now());
}
export function cancelLiveTest(companyId) {
    activeByCompany.delete(String(companyId));
}
/** Si hay prueba activa y no expirada, la consume y devuelve true (una sola vez). */
export function takeLiveTestIfActive(companyId) {
    const id = String(companyId);
    const started = activeByCompany.get(id);
    if (started == null)
        return false;
    if (Date.now() - started > SESSION_MAX_MS) {
        activeByCompany.delete(id);
        return false;
    }
    activeByCompany.delete(id);
    return true;
}
//# sourceMappingURL=webhookTestSession.js.map