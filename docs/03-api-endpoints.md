# Endpoints v1

La mayoría de la ingesta entra por **un solo webhook de Segment** — no hace falta
un endpoint por fuente (Klaviyo, Wati, GA4, Typeform), porque Segment ya las
unifica antes de llegar a Supabase.

**Estado de implementación (2026-08-20):** esto era spec pura hasta que arrancó
la migración del backend real. Los 4 endpoints de Touchpoints (`GET`/`POST`
`/touchpoints`, `PATCH`/`DELETE` `/touchpoints/:id`) ya existen como código —
funciones serverless en `app/api/touchpoints/` — y el frontend los usa en vez
de hablarle a Supabase directo (ver `10-como-operar.md`). El resto de la tabla
sigue siendo spec: todavía no tienen código, el frontend sigue llamando a
Supabase directamente para esas partes.

| Método | Endpoint | Qué hace | Quién lo llama |
|---|---|---|---|
| `POST` | `/webhooks/segment` | Recibe eventos de Segment, hace upsert del contacto (por email/id externo), inserta en `eventos`. Si el evento trae texto (form, reply, WhatsApp) dispara clasificación VOC | Segment |
| `POST` | `/voc/classify` (interno, async) | Toma un fragmento crudo, llama a Claude API (Haiku), escribe tags + sentiment + gap COM-B resuelto, recalcula el componente VOC del score | Worker interno, disparado por el webhook anterior |
| `GET` | `/contactos` | Lista/filtra contactos por clasificación, score, frustración — vista principal del CRM (tabla) | Frontend |
| `GET` | `/contactos/:id` | Ficha de contacto: historial de scores, fragmentos VOC, desglose de frustración, acción recomendada, deals asociados | Frontend |
| `GET` | `/deals?etapa=` | Lista deals agrupados por etapa — potencia el pipeline kanban | Frontend |
| `GET` | `/actividad-global?desde=` | Timeline combinado (eventos + VOC + cambios de etapa) — usa la vista `actividad_global` | Frontend |
| `GET` | `/voc/explorer` | Busca/filtra fragmentos VOC por tag, sentiment, fecha — potencia el VOC Explorer | Frontend |
| `GET` / `POST` | `/comb-gaps` | Lee y edita la tabla de mapeo VOC→COM-B→nudge (config del equipo) | Frontend (panel de admin) |
| `GET` | `/frustration/alerts` | Feed de alertas activas sin reconocer | Frontend / integración con Slack o email |
| `GET` | `/dashboard/summary` | Agregados: conteo HOT/WARM/COLD, promedio de frustración, tags VOC más frecuentes | Frontend |
| `GET` | `/wiki` | Lista los artículos de la wiki por categoría | Frontend |
| `GET` | `/wiki/:slug` | Artículo puntual — es lo que abre el ícono "?" contextual junto a un score o al índice de frustración en la ficha de contacto | Frontend |

## Endpoints de Touchpoints y Automatización

Detalle completo del motor de evaluación (condiciones, cooldown, ciclo de vida)
en [`08-touchpoints-automatizacion.md`](08-touchpoints-automatizacion.md).

| Método | Endpoint | Qué hace | Quién lo llama |
|---|---|---|---|
| `GET` | `/touchpoints` | Lista los touchpoints configurados del proyecto | Frontend (pantalla de config) |
| `POST` | `/touchpoints` | Crea un touchpoint (name, channel, comb_gap_id, template_ref, trigger_conditions, priority) | Frontend |
| `PATCH` | `/touchpoints/:id` | Edita condiciones o activa/pausa (`activo`) sin borrar | Frontend |
| `GET` | `/touchpoints/pending` | Fallback de reconciliación si el webhook saliente falló — el mecanismo primario es el DB webhook (ver abajo) | Zapier |
| `POST` | `/webhooks/touchpoint-sent` | Callback de Zapier/Klaviyo confirmando el envío real → `status='sent'` | Zapier |
| `POST` | `/touchpoint-triggers/:id/skip` | Descarte manual desde la ficha de contacto | Frontend |

## Endpoints del Constructor de Panel (onboarding)

Detalle de implementación del Modo Chat en
[`05-modo-chat-claude.md`](05-modo-chat-claude.md); flujo pantalla a pantalla en
[`04-constructor-panel-onboarding.md`](04-constructor-panel-onboarding.md).

| Método | Endpoint | Qué hace | Quién lo llama |
|---|---|---|---|
| `GET` | `/onboarding/constructor/templates` | Lista los 4 esquemas pre-cargados con su preview — potencia el Modo Selector | Frontend (Modo Selector) |
| `POST` | `/onboarding/constructor/chat` | Recibe `{project_id, mensaje}`, agrega el mensaje al historial de `esquema_chat_sessions`, llama a Claude (Sonnet) con todo el historial. Sirve tanto para el primer mensaje como para una vuelta de "regenerar con feedback" — es la misma sesión de conversación | Frontend (Modo Chat) |
| `POST` | `/onboarding/constructor/confirmar` | Recibe `{project_id, esquema_final}` (de Chat o de Selector, ya editado a mano si hizo falta), lo escribe en `projects.esquema_config`, marca la sesión como `confirmado` | Frontend |

## Automatización sin motor propio

Cuando se inserta una fila en `touchpoint_triggers` con status `pending`, un
**DB webhook de Supabase** (dispara automáticamente ante un INSERT, sin código
extra) empuja ese evento a Zapier, que a su vez llama a Klaviyo o Wati para
enviar el mensaje real. Así v1 tiene automatización funcional sin escribir un
flow builder propio — eso queda para v2.
