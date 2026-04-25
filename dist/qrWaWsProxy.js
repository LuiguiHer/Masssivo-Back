import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "./config.js";
function httpToWsBase(url) {
    if (url.startsWith("https://"))
        return "wss://" + url.slice("https://".length);
    if (url.startsWith("http://"))
        return "ws://" + url.slice("http://".length);
    return url;
}
/**
 * El navegador abre wss con JWT (query) al mismo origen; aquí reenviamos a masssivo-qr-wa con la clave interna.
 * Registra un listener `upgrade` (solo atiende /api/send/qr/ws).
 */
export function attachQrWaWebSocketProxy(httpServer, jwtSecret) {
    const wss = new WebSocketServer({ noServer: true });
    wss.on("connection", (clientWs, req) => {
        const base = config.masssivoQrWaUrl?.replace(/\/$/, "");
        const key = config.masssivoQrWaKey;
        if (!base || !key) {
            clientWs.close(4501, "Canal QR no configurado");
            return;
        }
        const u = new URL(req.url ?? "/api/send/qr/ws", "http://127.0.0.1");
        const token = u.searchParams.get("token");
        if (!token) {
            clientWs.close(4401, "Falta token");
            return;
        }
        let companyId;
        try {
            const pl = jwt.verify(token, jwtSecret);
            if (!pl?.companyId) {
                clientWs.close(4403, "Sin empresa en token");
                return;
            }
            companyId = String(pl.companyId);
        }
        catch {
            clientWs.close(4402, "Token inválido");
            return;
        }
        const wsUrl = `${httpToWsBase(base)}/v1/ws?companyId=${encodeURIComponent(companyId)}&internalKey=${encodeURIComponent(key)}`;
        const upstream = new WebSocket(wsUrl);
        const closeBoth = (code) => {
            try {
                clientWs.close(code);
            }
            catch {
                /* noop */
            }
            try {
                upstream.close();
            }
            catch {
                /* noop */
            }
        };
        upstream.on("open", () => {
            const pipe = (from, to) => {
                from.on("message", (d, isBinary) => {
                    if (to.readyState === WebSocket.OPEN)
                        to.send(d, { binary: isBinary });
                });
            };
            pipe(clientWs, upstream);
            pipe(upstream, clientWs);
        });
        upstream.on("error", (e) => {
            console.error("[qr-ws proxy] upstream", e);
            closeBoth(1011);
        });
        clientWs.on("error", (e) => {
            console.error("[qr-ws proxy] client", e);
        });
        clientWs.on("close", () => {
            if (upstream.readyState === WebSocket.OPEN)
                upstream.close();
        });
        upstream.on("close", () => {
            if (clientWs.readyState === WebSocket.OPEN)
                clientWs.close();
        });
    });
    httpServer.on("upgrade", (request, socket, head) => {
        const path = (() => {
            try {
                return new URL(request.url ?? "", "http://127.0.0.1").pathname;
            }
            catch {
                return "";
            }
        })();
        if (path !== "/api/send/qr/ws")
            return;
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    });
}
//# sourceMappingURL=qrWaWsProxy.js.map