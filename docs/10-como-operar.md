# Cómo operar el proyecto (guía práctica)

Esto es un **How-to** (ver la nota sobre metodología de documentación más abajo):
asume que ya sabés lo que es Signal IQ y te lleva paso a paso a resolver algo
puntual. No es para entender el "por qué" (eso está en `01`, `02`, `08`, `09`) —
es para cuando necesitás **hacer** algo y no querés repetir una pelea que ya
peleamos una vez.

## Correr una migración nueva en Supabase

- **Setup desde cero**: pegar `supabase/schema.sql` completo en el SQL Editor.
  Si tira algún error puntual, es más fácil cortarlo en 2-3 bloques (tablas →
  seeds → funciones/triggers) que pegar las ~1000 líneas de una — más fácil
  ubicar dónde falló.
- **Cambios sobre una base que ya tiene el schema corrido**: no volver a correr
  `schema.sql` entero (los `create table` van a fallar porque ya existen) — se
  necesita una migración incremental (`alter table`, `create table` solo de lo
  nuevo, `create or replace function` para lo que cambió). Cada vez que se
  agrega algo así en una sesión, damos el bloque de SQL puntual para correr —
  no queda en ningún archivo del repo todavía porque no lo pedimos, pero se
  puede reconstruir comparando el `schema.sql` viejo vs nuevo en git si hace
  falta (`git log -p supabase/schema.sql`).

## Exponer un schema o tabla nueva en la API de Supabase

Este es el runbook que más nos costó armar en la sesión del 2026-08-20 — son
**3 pasos independientes**, los 3 hacen falta, y Supabase no avisa cuál falta:
el error que tira no dice "te falta el paso 2", tira algo genérico.

### Paso 1 — Exponer el *schema* en la Data API

Dashboard del proyecto → **Integrations → Data API → pestaña Settings** →
sección **"Exposed schemas"** → tildar el schema (ej. `signal_iq`) → **Save**
(el checkbox sin guardar no aplica nada).

⚠️ Esto es distinto de **"Exposed tables"**, que está en la misma pantalla más
abajo y controla acceso **tabla por tabla** — no reemplaza el paso de schema,
es un permiso aparte. Si el error es `Invalid schema: <nombre>`, es este paso
el que falta.

### Paso 2 — Dar permisos a nivel SQL (`GRANT`)

Exponerlo en el dashboard no le da automáticamente a los roles que usa la API
(`anon`, `authenticated`) permiso para leer. Si el error cambia a
`permission denied for schema <nombre>`, correr:

```sql
grant usage on schema signal_iq to anon, authenticated;
grant select on all tables in schema signal_iq to anon, authenticated;
alter default privileges in schema signal_iq grant select on tables to anon, authenticated;
```

La tercera línea es la importante para no repetir esto cada vez: hace que
**cualquier tabla nueva** creada después (como pasó con `pipelines`) ya nazca
con el permiso — confirmado en la sesión del kanban de Pipeline, no hizo falta
repetir el `GRANT` para la tabla nueva, solo el paso 1 y el paso 3.

### Paso 3 — Row Level Security (RLS)

Si la consulta ya no da error pero devuelve **0 filas siendo que sabés que hay
datos**, es RLS: Postgres filtra en silencio (no tira error) cuando está
activado y no hay ninguna política que le diga a `anon` qué puede ver. Pasó
varias veces al exponer tablas nuevas desde el dashboard — parece que Supabase
lo activa solo en ese flujo.

Para un proyecto interno sin login todavía, lo más simple es desactivarlo:

```sql
alter table signal_iq.<tabla> disable row level security;
```

Es reversible en cualquier momento. Cuando haya login real, ahí conviene
volver a activarlo con políticas por `project_id` (queda anotado como pendiente
en `02-data-model.md`).

### Resumen — qué error corresponde a qué paso

| Error / síntoma | Paso que falta |
|---|---|
| `Invalid schema: signal_iq` | 1 — Exposed schemas |
| `permission denied for schema signal_iq` | 2 — GRANT |
| Sin error, pero devuelve `[]` habiendo datos | 3 — RLS |

## Cargar datos de prueba

Orden exacto (cada uno depende del anterior):

1. `supabase/schema.sql` — schema completo
2. `supabase/seed-demo.sql` — 3 contactos base (Sofía, Martín, Lucía)
3. Migración de pipelines (ver `08-touchpoints-automatizacion.md` y el historial
   de commits de `schema.sql` — agrega `pipelines`, `deals.pipeline_id`, canal
   `push`)
4. `supabase/seed-demo-pipelines.sql` — pipelines Loyalty/Ventas + deals +
   contacto Elena

Para verificar que un seed insertó bien sin depender del frontend:

```sql
select nombre, current_score, current_classification, current_frustration_index
from signal_iq.contactos order by current_score desc nulls last;
```

## Levantar el frontend local

```bash
cd app
npm install          # solo la primera vez
cp .env.local.example .env.local   # completar con los mismos valores que
                                    # ../Behavioral design metología - vApp/.env.local
                                    # (mismo proyecto de Supabase, "Behavioral platform")
npm run dev
```

Por default corre en `http://localhost:5173`; en esta sesión lo fijamos a
`5183` con `npm run dev -- --port 5183 --strictPort` para no chocar con otros
proyectos.

## Backend/API real: funciones serverless de Vercel

Desde el 2026-08-20 arrancó la migración de "frontend habla directo con
Supabase" a "frontend habla con un backend propio", usando **funciones
serverless de Vercel** en `app/api/*.ts` — mismo proyecto y deploy que el
frontend, no hace falta hosting nuevo. Dos gotchas encontrados armando el
primer bloque (Touchpoints):

### Mapa: qué pantalla usa qué capa de datos

El código convive con dos formas de traer datos mientras dura la migración —
esto no es accidental ni desprolijo, es el estado intermedio esperado. Antes
de tocar una pantalla, conviene saber cuál le toca:

| Pantalla | Capa de datos | Archivo |
|---|---|---|
| Touchpoints (`/touchpoints`) | Backend propio (`fetch` a `/api/touchpoints`) | `src/lib/api.ts` |
| Contactos, Ficha de Contacto, Pipeline, Actividad global, VOC Explorer, Dashboard, Constructor de Panel | Supabase directo desde el navegador | `src/lib/queries.ts` |

`src/lib/api.ts` va a ir creciendo a medida que se migre cada pantalla — el
patrón para migrar una es: crear el/los endpoint(s) en `app/api/`, replicar
la firma de la función correspondiente de `queries.ts` en `api.ts` (mismo
nombre y tipo de retorno para minimizar el cambio en el componente), probar
en un deploy de preview, y recién ahí borrar la versión vieja de
`queries.ts`. `docs/03-api-endpoints.md` tiene el mapeo completo de qué
endpoints faltan.

### `vercel.json` tiene que excluir `/api/*` del rewrite del SPA

El rewrite que manda todo a `index.html` para que React Router maneje las
rutas (`/(.*)  → /index.html`) también agarra `/api/*` si no se excluye
explícitamente — las funciones serverless quedan invisibles, todo devuelve el
HTML del SPA en vez de JSON. Fix, con lookahead negativo:

```json
{
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

### Los imports relativos dentro de `app/api/` necesitan la extensión `.js`

Con `"type": "module"` en `package.json`, el runtime de Node de Vercel
resuelve los imports como ESM nativo estricto. `import { x } from '../_lib/foo'`
(sin extensión) tira `ERR_MODULE_NOT_FOUND` y la función crashea con 500 — hay
que escribir `from '../_lib/foo.js'` aunque el archivo real sea `.ts`. Esto es
distinto al resto del proyecto (Vite, en `src/`), donde los imports sin
extensión funcionan bien — es un comportamiento específico del bundler de
funciones de Vercel.

### Cómo probar cambios de `vercel.json` o de rutas sin arriesgar producción

`deploy_to_vercel` con `target: "preview"` en vez de `"production"` crea un
deploy separado que no toca el link público. Los deploys de preview piden
login de Vercel por default — para probarlos sin login hace falta el tool
`get_access_to_vercel_url`, que genera un link temporal
(`?_vercel_share=...`, expira en ~24hs). Una vez confirmado que anda, el mismo
árbol de archivos se redeploya con `target: "production"`.

## Otros errores encontrados y su causa

| Síntoma | Causa | Fix |
|---|---|---|
| Un número "viejo" en un historial que no coincide con el valor actual mostrado en otra pantalla | `now()` queda fijo durante toda una transacción — varios recálculos en cascada quedan con el mismo timestamp y "traeme el último" no tiene con qué desempatar | Usar `clock_timestamp()` en vez de `now()` en columnas de historial append-only. Detalle completo en `09-matematica-del-modelo.md`, concepto 8 |
| Un link a un archivo del repo tira 404 en GitHub | El repo es **privado** — 404 es lo que devuelve GitHub a cualquiera que no esté logueado como `jmarroncle`, para no revelar que el repo existe | Confirmar que el navegador tiene sesión iniciada como `jmarroncle`; si no, pedir el contenido directo en el chat en vez de depender del link |
| Función serverless en `app/api/` devuelve 500 `FUNCTION_INVOCATION_FAILED` | Ver los dos gotchas de arriba (rewrite o import sin `.js`) | Revisar `get_runtime_logs` del deployment — el error real (`ERR_MODULE_NOT_FOUND`, etc.) aparece ahí, la página de error genérica de Vercel no lo muestra |

## Nota sobre metodología de documentación

Los docs de este repo siguen (sin haberlo planeado desde el día 1, pero
consistente en retrospectiva) el framework **Diátaxis**, que separa toda
documentación técnica en 4 tipos según qué pregunta responde:

| Tipo | Responde a | Dónde está en este repo |
|---|---|---|
| **Reference** | "¿Cómo es exactamente X?" | `02`, `03`, `05`, `06`, `08` (el detalle técnico) |
| **Explanation** | "¿Por qué es así?" | `01` (criterios de scope), `09` (la matemática) |
| **How-to guide** | "¿Cómo hago X puntual?" | Este doc (`10`) |
| **Tutorial** | "Llevame de cero a algo andando" | No existe todavía — sería el candidato si en algún momento alguien nuevo (un dev que se suma) necesita onboardearse paso a paso |
