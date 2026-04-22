# Masssivo Back (WhatsApp Cloud API)

Servicio Node (Express + MongoDB + Socket.IO) para webhook de WhatsApp Cloud, portal Send (`/api/send`), e inbox (`/inbox`).

## Requisitos

- Node.js ≥ 18
- MongoDB
- Variables de entorno (copia `.env.example` a `.env`)

## Arranque

```bash
npm ci
npm start
```

Por defecto escucha el puerto definido en `dist/config.js` / entorno (suele ser `3000` detrás de nginx).

## Repositorio

Este árbol incluye `dist/` compilado listo para producción y `src/` parcialmente (varios módulos solo existen compilados en `dist/` hasta alinear todo el código fuente).
