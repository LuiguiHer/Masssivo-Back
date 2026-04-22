export function canonicalWaId(input) {
    const digits = String(input ?? "").replace(/\D/g, "");
    if (!digits)
        return "";
    // Normaliza prefijo internacional con 00 -> sin 00 (ej: 0057... -> 57...)
    const noIntl00 = digits.startsWith("00") ? digits.slice(2) : digits;
    // Caso común de México en WhatsApp: 521XXXXXXXXXX vs 52XXXXXXXXXX
    if (noIntl00.startsWith("521") && noIntl00.length >= 12) {
        return `52${noIntl00.slice(3)}`;
    }
    return noIntl00;
}
export function waIdAliases(input) {
    const base = canonicalWaId(input);
    if (!base)
        return [];
    const set = new Set([base]);
    // Alias inverso para conversaciones históricas MX
    if (base.startsWith("52") && base.length >= 11) {
        set.add(`521${base.slice(2)}`);
    }
    if (base.startsWith("521") && base.length >= 12) {
        set.add(`52${base.slice(3)}`);
    }
    // Alias de Colombia: 57 + número móvil de 10 dígitos
    if (base.startsWith("57") && base.length === 12) {
        set.add(base.slice(2));
    }
    else if (base.length === 10) {
        set.add(`57${base}`);
    }
    return [...set];
}
export function waIdGroupKey(input) {
    const base = canonicalWaId(input);
    if (!base)
        return "";
    // Agrupa 57XXXXXXXXXX con XXXXXXXXXX en una sola conversación.
    if (base.startsWith("57") && base.length === 12)
        return base.slice(2);
    return base;
}
//# sourceMappingURL=waId.js.map