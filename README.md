# Masssivo Back (WhatsApp Cloud API)

Servicio Node (Express + MongoDB + Socket.IO) para webhook de WhatsApp Cloud, portal Send (`/api/send`) e inbox (`/inbox`).

## Requisitos

- Node.js ≥ 18
- MongoDB
- Variables de entorno (copia `.env.example` a `.env`)

## Desarrollo y compilación

Todo el código fuente está en `src/`. Compilar antes de arrancar en producción:

```bash
npm ci
npm run build
npm start
```

CLI de prueba (texto):

```bash
npx tsx src/cli/sendText.ts <E164_sin_+> "mensaje"
```

(definí `WA_ACCESS_TOKEN` y `WA_PHONE_NUMBER_ID` en `.env`)

## Arranque (solo `dist/` ya generado)

```bash
npm ci
npm start
```

Por defecto escucha el puerto de `PORT` o `3000` (`config`), detrás de nginx en producción.
