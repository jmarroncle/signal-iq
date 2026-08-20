# Signal IQ

Plataforma que unifica **VOC (Voice of Customer)** y **Lead Scoring** en una sola app,
orientada a equipos de marketing que ejecutan lanzamientos de productos financieros
o de inversión.

Caso de partida: **Tutellus / tokenización agrícola**.

## Por dónde empezar (si es tu primera vez viendo esto)

1. Probá la app en vivo: **[signal-iq-jet.vercel.app](https://signal-iq-jet.vercel.app)** — sin login todavía, a propósito (ver "Estado" más abajo).
2. Para el contexto de negocio (qué problema resuelve y por qué), seguí con `01-mvp-scope.md` y `09-matematica-del-modelo.md`.
3. Para el detalle técnico exacto (modelo de datos, endpoints, fórmulas), la tabla de abajo indexa los 10 docs de `docs/` — no hace falta leerlos todos, cada fila dice qué cubre cada uno.
4. Si vas a correr el código local, `docs/10-como-operar.md` tiene el paso a paso y los errores más comunes ya resueltos.

## Qué resuelve

Combina tres cosas que normalmente viven separadas:

1. **Lead Scoring** — score unificado en 4 dimensiones (perfil demográfico,
   comportamiento, lenguaje VOC, bonus recurrencia) clasificado en HOT / WARM / COLD.
2. **VOC Explorer** — captura y clasifica fragmentos de texto (formularios, replies
   de email, WhatsApp) con NLP vía Claude API. Tags: confusión, precio, riesgo legal,
   intención de compra, proceso complejo.
3. **COM-B Gaps** — mapea cada tag VOC a una brecha del modelo COM-B
   (Capability / Opportunity / Motivation) y recomienda el nudge conductual
   correspondiente.
4. **CRM nativo** — 4 entidades core (Contacto, Deal, Evento, Fragmento VOC) con
   vistas de tabla filtrable, pipeline kanban, actividad global y ficha de
   contacto. Setup vía **Constructor de Panel**: el usuario sin CRM describe su
   negocio en lenguaje natural (Modo Chat, vía Claude) o elige una de 4
   plantillas (Modo Selector) y la app arma el esquema de campos custom y
   etapas de pipeline adaptado a ese negocio.

El diferencial: nadie más combina score de lead + lenguaje real del cliente +
recomendación conductual accionable en una sola vista — con o sin CRM propio.

## Documentación

Organizada según [Diátaxis](https://diataxis.fr/): **Reference** (el detalle
técnico exacto), **Explanation** (el por qué), **How-to** (resolver algo
puntual), **Tutorial** (onboarding de cero — el bloque "Por dónde empezar" de
arriba cumple ese rol de forma liviana; no hay un doc dedicado todavía porque
el repo recién ahora empieza a tener lectores que no son el propio autor).

| Doc | Tipo | Qué cubre |
|---|---|---|
| [`01-mvp-scope.md`](docs/01-mvp-scope.md) | Explanation | Qué entra en v1.0 y qué queda para v2, y por qué |
| [`02-data-model.md`](docs/02-data-model.md) | Reference | Modelo de datos completo en Supabase |
| [`03-api-endpoints.md`](docs/03-api-endpoints.md) | Reference | Endpoints v1 |
| [`04-constructor-panel-onboarding.md`](docs/04-constructor-panel-onboarding.md) | Reference | Flujo de onboarding pantalla a pantalla |
| [`05-modo-chat-claude.md`](docs/05-modo-chat-claude.md) | Reference | Implementación del Modo Chat con la API de Claude |
| [`06-formulas-scoring-frustracion.md`](docs/06-formulas-scoring-frustracion.md) | Reference | Fórmulas del Lead Score y el Frustration Index, funciones SQL y cuándo se recalculan |
| [`07-wiki-metricas.md`](docs/07-wiki-metricas.md) | Reference | Wiki in-app: qué es cada métrica y por qué importa para el negocio |
| [`08-touchpoints-automatizacion.md`](docs/08-touchpoints-automatizacion.md) | Reference | Motor de evaluación de touchpoints, cooldown, ciclo de vida de los triggers |
| [`09-matematica-del-modelo.md`](docs/09-matematica-del-modelo.md) | Explanation | Los conceptos matemáticos detrás de todo el proyecto, con intuición y ejemplos |
| [`10-como-operar.md`](docs/10-como-operar.md) | How-to | Migraciones, exponer schemas/tablas en Supabase, cargar seeds, errores comunes |

## Stack

- **Segment** — bus de eventos (unifica Klaviyo, Wati/respond.io, GA4, Typeform)
- **Supabase** (proyecto compartido "Behavioral platform", schema propio `signal_iq`)
  — warehouse y backend (Postgres + REST API + auth)
- **Claude API**:
  - `claude-haiku-4-5-20251001` — clasificación NLP de fragmentos VOC en tiempo
    real, alto volumen → se prioriza costo sobre precisión marginal
  - `claude-sonnet-4-6` — Modo Chat del Constructor de Panel, bajo volumen (una
    vez por cuenta) y alto impacto → se prioriza calidad de interpretación

## Estado

App pública y funcionando: **[signal-iq-jet.vercel.app](https://signal-iq-jet.vercel.app)**
(sin login todavía — a propósito, ver más abajo).

- ✅ MVP, modelo de datos, fórmulas y flujos de onboarding diseñados (`docs/`)
- ✅ Schema corrido en Supabase ("Behavioral platform", schema `signal_iq`) — tablas, funciones, triggers y seeds en producción
- ✅ CRM nativo completo (`app/`) — Resumen/Dashboard, Contactos, Ficha de Contacto, Pipeline (Loyalty + Ventas), Actividad global, Wiki in-app
- ✅ VOC Explorer — feed global de fragmentos VOC con filtros y distribución por brecha COM-B, más carga manual mientras no hay clasificación automática
- ✅ Touchpoints — CRUD completo de reglas, verificado disparando en vivo desde un cambio de etapa de pipeline
- ✅ Constructor de Panel — Modo Selector (4 plantillas) con preview editable y pantalla de resumen de la configuración guardada. Modo Chat queda deshabilitado a propósito, para el final (ver abajo)
- ✅ Deploy público en Vercel
- 🔶 Backend/API real — **en marcha**: primer bloque migrado (Touchpoints, vía funciones serverless de Vercel en `app/api/`). El resto (Contactos, Deals, VOC, Constructor de Panel) todavía habla directo con Supabase desde el frontend — ver `03-api-endpoints.md` para el mapeo completo pendiente
- ⬜ Integraciones (Segment, Klaviyo/Wati, `pg_cron`)
- ⬜ Modo Chat del Constructor de Panel y clasificación VOC automática (ambos necesitan la API key de Claude protegida server-side — dependen de terminar el backend)
- ⬜ Auth/login y RLS — decisión consciente de dejarlo para el final, para poder iterar rápido sobre el resto de la herramienta sin la fricción de un login
