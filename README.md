# Signal IQ

Plataforma que unifica **VOC (Voice of Customer)** y **Lead Scoring** en una sola app,
orientada a equipos de marketing que ejecutan lanzamientos de productos financieros
o de inversión.

Caso de partida: **Tutellus / tokenización agrícola**.

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

- [`docs/01-mvp-scope.md`](docs/01-mvp-scope.md) — qué entra en v1.0 y qué queda para v2, y por qué
- [`docs/02-data-model.md`](docs/02-data-model.md) — modelo de datos completo en Supabase
- [`docs/03-api-endpoints.md`](docs/03-api-endpoints.md) — endpoints v1
- [`docs/04-constructor-panel-onboarding.md`](docs/04-constructor-panel-onboarding.md) — flujo de onboarding pantalla a pantalla
- [`docs/05-modo-chat-claude.md`](docs/05-modo-chat-claude.md) — implementación del Modo Chat con la API de Claude
- [`docs/06-formulas-scoring-frustracion.md`](docs/06-formulas-scoring-frustracion.md) — fórmulas del Lead Score y el Frustration Index, funciones SQL y cuándo se recalculan
- [`docs/07-wiki-metricas.md`](docs/07-wiki-metricas.md) — wiki in-app: qué es cada métrica y por qué importa para el negocio
- [`docs/08-touchpoints-automatizacion.md`](docs/08-touchpoints-automatizacion.md) — motor de evaluación de touchpoints, cooldown, ciclo de vida de los triggers
- [`docs/09-matematica-del-modelo.md`](docs/09-matematica-del-modelo.md) — los conceptos matemáticos detrás de todo el proyecto, explicados una vez con intuición y ejemplos

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

- ✅ MVP, modelo de datos, fórmulas y flujos de onboarding diseñados (`docs/`)
- ✅ Schema corrido en Supabase ("Behavioral platform", schema `signal_iq`) — tablas, funciones, triggers y seeds en producción
- ⬜ Frontend — no hay UI todavía
- ⬜ Backend/API (los endpoints de `03-api-endpoints.md` son spec, no código)
- ⬜ Integraciones (Segment, Klaviyo/Wati, `pg_cron`)
