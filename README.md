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

El diferencial: nadie más combina score de lead + lenguaje real del cliente +
recomendación conductual accionable en una sola vista.

## Documentación

- [`docs/01-mvp-scope.md`](docs/01-mvp-scope.md) — qué entra en v1.0 y qué queda para v2, y por qué
- [`docs/02-data-model.md`](docs/02-data-model.md) — modelo de datos completo en Supabase
- [`docs/03-api-endpoints.md`](docs/03-api-endpoints.md) — endpoints v1

## Stack

- **Segment** — bus de eventos (unifica Klaviyo, Wati/respond.io, GA4, Typeform)
- **Supabase** (proyecto compartido "Behavioral platform", schema propio `signal_iq`)
  — warehouse y backend (Postgres + REST API + auth)
- **Claude API** (`claude-haiku-4-5-20251001`) — clasificación NLP de fragmentos VOC
  en tiempo real, alto volumen → se prioriza costo sobre precisión marginal

## Estado

Fase de diseño — MVP y modelo de datos definidos, sin implementar todavía.
