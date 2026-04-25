import { readFile } from "node:fs/promises";
/**
 * Sube al microservicio masssivo-media usando FormData _nativo_ + fetch.
 * El paquete `form-data` + `fetch` de Node (undici) genera body multipart truncado → "Unexpected end of form" en el receptor.
 */
export async function uploadFileToMediaService(baseUrl, internalKey, localPath, companyId, originalName, mimetype) {
    const buf = await readFile(localPath);
    const name = (originalName && originalName.trim()) || "image.jpg";
    const blob = new Blob([buf], { type: mimetype || "image/jpeg" });
    const f = new FormData();
    f.append("companyId", companyId);
    f.append("file", blob, name);
    const url = `${baseUrl.replace(/\/$/, "")}/v1/upload`;
    const r = await fetch(url, {
        method: "POST",
        headers: { "X-Internal-Key": internalKey },
        body: f,
    });
    const t = await r.text();
    let data = null;
    try {
        data = t ? JSON.parse(t) : null;
    }
    catch {
        data = { raw: t };
    }
    if (!r.ok) {
        const err = data?.error;
        throw new Error(typeof err === "string" && err ? err : `Error de almacenamiento (${r.status})`);
    }
    const d = data;
    if (!d.bucket || !d.key || !d.publicUrl)
        throw new Error("Respuesta de almacenamiento inválida");
    return { bucket: d.bucket, key: d.key, publicUrl: d.publicUrl };
}
export async function deleteObjectFromMediaService(baseUrl, internalKey, key) {
    if (!key.trim())
        return;
    const url = `${baseUrl.replace(/\/$/, "")}/v1/object`;
    const r = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Internal-Key": internalKey },
        body: JSON.stringify({ key: key.trim() }),
    });
    if (!r.ok && r.status !== 404) {
        const t = await r.text();
        throw new Error(t || `No se pudo eliminar en almacenamiento (${r.status})`);
    }
}
//# sourceMappingURL=mediaServiceClient.js.map