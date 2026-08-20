# Endpoints v1

La mayoría de la ingesta entra por **un solo webhook de Segment** — no hace falta
un endpoint por fuente (Klaviyo, Wati, GA4, Typeform), porque Segment ya las
unifica antes de llegar a Supabase.

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
| `GET` | `/touchpoints/pending` | Lista triggers en estado `pending` para que Klaviyo/Wati los levanten | Zapier / webhook saliente de Supabase |
| `GET` | `/dashboard/summary` | Agregados: conteo HOT/WARM/COLD, promedio de frustración, tags VOC más frecuentes | Frontend |
| `GET` | `/wiki` | Lista los artículos de la wiki por categoría | Frontend |
| `GET` | `/wiki/:slug` | Artículo puntual — es lo que abre el ícono "?" contextual junto a un score o al índice de frustración en la ficha de contacto | Frontend |

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
