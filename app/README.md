# Signal IQ — app

Frontend de Signal IQ. Documentación completa del producto en el
[`README.md` de la raíz del repo](../README.md) — este archivo es solo para
levantar el código local.

## Correr local

```bash
npm install          # solo la primera vez
cp .env.local.example .env.local   # completar con las credenciales de Supabase
npm run dev
```

Detalle de dónde sacar las credenciales y errores comunes en
[`../docs/10-como-operar.md`](../docs/10-como-operar.md).

## Estructura

- `src/pages/` — una pantalla por archivo, ruteadas en `src/App.tsx`
- `src/lib/queries.ts` — llamadas directas a Supabase (la mayoría de las pantallas, todavía)
- `src/lib/api.ts` — llamadas al backend propio en `api/` (Touchpoints, migrando el resto de a poco)
- `api/` — funciones serverless de Vercel (Node.js) — el backend real, en construcción
- Stack: Vite + React 19 + TypeScript + Tailwind v4 + Supabase JS
