# Endpoints v1

La mayoría de la ingesta entra por **un solo webhook de Segment** — no hace falta
un endpoint por fuente (Klaviyo, Wati, GA4, Typeform), porque Segment ya las
unifica antes de llegar a Supabase.

| Método | Endpoint | Qué hace | Quién lo llama |
|---|---|---|---|
| `POST` | `/webhooks/segment` | Recibe eventos de Segment, hace upsert del lead (por email/id externo), inserta en `eventos`. Si el evento trae texto (form, reply, WhatsApp) dispara clasificación VOC | Segment |
| `POST` | `/voc/classify` (interno, async) | Toma un fragmento crudo, llama a Claude API (Haiku), escribe tags + sentiment + gap COM-B resuelto, recalcula el componente VOC del score | Worker interno, disparado por el webhook anterior |
| `GET` | `/leads` | Lista/filtra leads por clasificación, score, frustración — vista principal del dashboard | Frontend |
| `GET` | `/leads/:id` | Detalle completo: historial de scores, fragmentos VOC, desglose de frustración, acción recomendada | Frontend |
| `GET` | `/voc/explorer` | Busca/filtra fragmentos VOC por tag, sentiment, fecha — potencia el VOC Explorer | Frontend |
| `GET` / `POST` | `/comb-gaps` | Lee y edita la tabla de mapeo VOC→COM-B→nudge (config del equipo) | Frontend (panel de admin) |
| `GET` | `/frustration/alerts` | Feed de alertas activas sin reconocer | Frontend / integración con Slack o email |
| `GET` | `/touchpoints/pending` | Lista triggers en estado `pending` para que Klaviyo/Wati los levanten | Zapier / webhook saliente de Supabase |
| `GET` | `/dashboard/summary` | Agregados: conteo HOT/WARM/COLD, promedio de frustración, tags VOC más frecuentes | Frontend |

## Automatización sin motor propio

Cuando se inserta una fila en `touchpoint_triggers` con status `pending`, un
**DB webhook de Supabase** (dispara automáticamente ante un INSERT, sin código
extra) empuja ese evento a Zapier, que a su vez llama a Klaviyo o Wati para
enviar el mensaje real. Así v1 tiene automatización funcional sin escribir un
flow builder propio — eso queda para v2.
