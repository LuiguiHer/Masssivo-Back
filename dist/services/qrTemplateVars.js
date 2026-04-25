/**
 * Placeholders estilo plantillas Meta: {{1}}, {{2}}, … consecutivos desde 1 sin saltos.
 */
const META_VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;
export const MAX_QR_TEMPLATE_VAR_INDEX = 32;
function collectVarIndices(s) {
    const list = [];
    for (const m of s.matchAll(new RegExp(META_VAR_RE.source, "g"))) {
        const n = parseInt(String(m[1]), 10);
        list.push(n);
    }
    if (list.length === 0)
        return { indices: [], max: 0 };
    return { indices: list, max: Math.max(...list) };
}
/** @throws string mensaje de error en español */
export function assertMetaStyleConsecutiveTemplateVarsInText(s, fieldLabel) {
    const { max } = collectVarIndices(s);
    if (max === 0)
        return;
    if (max > MAX_QR_TEMPLATE_VAR_INDEX) {
        throw new Error(`En ${fieldLabel} podés usar hasta {{${MAX_QR_TEMPLATE_VAR_INDEX}}}.`);
    }
    const present = new Set();
    for (const m of s.matchAll(new RegExp(META_VAR_RE.source, "g"))) {
        const n = parseInt(String(m[1]), 10);
        if (!Number.isFinite(n) || n < 1)
            throw new Error(`Variable inválida en ${fieldLabel}.`);
        present.add(n);
    }
    for (let i = 1; i <= max; i++) {
        if (!present.has(i)) {
            throw new Error(`En ${fieldLabel} las variables deben ser consecutivas desde {{1}} hasta {{${max}}}, sin faltar. Falta {{${i}}}.`);
        }
    }
}
//# sourceMappingURL=qrTemplateVars.js.map