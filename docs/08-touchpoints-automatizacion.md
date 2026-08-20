# Touchpoints y Automatización

Recordatorio de la decisión de scope ([`01-mvp-scope.md`](01-mvp-scope.md)): v1
es **reglas fijas** (condiciones tipo "si score y frustración están en tal rango,
disparar tal touchpoint"), no un flow builder visual. El envío real del mensaje
lo sigue haciendo Klaviyo/Wati — Signal IQ decide *cuándo* y *a quién*, no
reemplaza la herramienta de envío.

Lo que faltaba diseñar hasta ahora era el motor que evalúa esas reglas: cuándo se
dispara un touchpoint, cómo se evita mandarle 4 mensajes al mismo contacto en una
hora, y qué pasa con un trigger que quedó pendiente y ya no tiene sentido enviar.

## Forma de `touchpoints.trigger_conditions`

```json
{
  "score_min": 70,
  "score_max": null,
  "frustration_min": null,
  "frustration_max": null,
  "clasificacion": ["HOT"],
  "tipo_contacto": null,
  "tags_requeridos": ["intencion_compra"],
  "custom_fields_match": { "perfil_riesgo": "Agresivo" },
  "pipeline_tipo": "loyalty",
  "etapa": "En riesgo de churn",
  "cooldown_dias": 7
}
```

Todos los campos son opcionales — un campo ausente o `null` no filtra por esa
dimensión. Un contacto matchea un touchpoint si cumple **todas** las condiciones
presentes (AND simple, sin OR ni anidamiento — eso es justamente lo que el flow
builder de v2 va a permitir y v1 no).

| Campo | Qué filtra |
|---|---|
| `score_min` / `score_max` | rango de `contactos.current_score` |
| `frustration_min` / `frustration_max` | rango de `contactos.current_frustration_index` |
| `clasificacion` | lista de `HOT`/`WARM`/`COLD` |
| `tipo_contacto` | `nuevo` / `recurrente` |
| `tags_requeridos` | el contacto tuvo un fragmento VOC con alguno de estos tags en los últimos 30 días |
| `custom_fields_match` | match exacto contra `contactos.custom_fields` (los campos que definió el Constructor de Panel) — reutiliza el índice GIN que ya existe, sin tablas nuevas |
| `pipeline_tipo` / `etapa` | el contacto tiene un deal en un pipeline de ese tipo (`loyalty`/`ventas`/`custom`), opcionalmente en esa etapa exacta — esto es lo que conecta el kanban con las notificaciones (`docs/02`, sección "Loyalty como pipeline principal") |
| `cooldown_dias` | mínimo de días entre dos disparos del mismo touchpoint al mismo contacto |

**Canales:** `email`, `whatsapp`, `sms`, `push` — el canal `push` es el que
usa el caso de loyalty ("le bajó el score a un cliente activo → push de
retención"), no requiere nada distinto del resto, es un valor más de
`touchpoints.channel`.

## Motor de evaluación

Se engancha en el mismo lugar que ya recalcula score y frustración — no hace
falta un mecanismo aparte. Cada vez que llega un evento o se clasifica un
fragmento VOC, después de recalcular ambas métricas se evalúan los touchpoints:

```sql
create or replace function signal_iq.evaluar_touchpoints_contacto(p_contacto_id uuid)
returns void as $$
declare
  v_contacto signal_iq.contactos%rowtype;
begin
  select * into v_contacto from signal_iq.contactos where id = p_contacto_id;

  insert into signal_iq.touchpoint_triggers (contacto_id, project_id, touchpoint_id, reason, status)
  select p_contacto_id, v_contacto.project_id, t.id,
    jsonb_build_object(
      'score', v_contacto.current_score,
      'clasificacion', v_contacto.current_classification,
      'frustracion', v_contacto.current_frustration_index,
      'evaluado_en', now()
    ),
    'pending'
  from (
    select t.*,
      row_number() over (partition by t.channel order by t.priority desc) as rn
    from signal_iq.touchpoints t
    where t.project_id = v_contacto.project_id
      and t.activo
      and (t.trigger_conditions->>'score_min' is null
           or v_contacto.current_score >= (t.trigger_conditions->>'score_min')::numeric)
      and (t.trigger_conditions->>'score_max' is null
           or v_contacto.current_score <= (t.trigger_conditions->>'score_max')::numeric)
      and (t.trigger_conditions->>'frustration_min' is null
           or coalesce(v_contacto.current_frustration_index, 0) >= (t.trigger_conditions->>'frustration_min')::numeric)
      and (t.trigger_conditions->>'frustration_max' is null
           or coalesce(v_contacto.current_frustration_index, 0) <= (t.trigger_conditions->>'frustration_max')::numeric)
      and (t.trigger_conditions->'clasificacion' is null
           or t.trigger_conditions->'clasificacion' ? v_contacto.current_classification)
      and (t.trigger_conditions->>'tipo_contacto' is null
           or v_contacto.tipo = t.trigger_conditions->>'tipo_contacto')
      and (t.trigger_conditions->'custom_fields_match' is null
           or v_contacto.custom_fields @> (t.trigger_conditions->'custom_fields_match'))
      and (t.trigger_conditions->'tags_requeridos' is null
           or exists (
             select 1 from signal_iq.fragmentos_voc f
             where f.contacto_id = p_contacto_id
               and f.ocurrido_en > now() - interval '30 days'
               and f.tag_semantico in (select jsonb_array_elements_text(t.trigger_conditions->'tags_requeridos'))
           ))
      and (t.trigger_conditions->>'pipeline_tipo' is null
           or exists (
             select 1 from signal_iq.deals d
             join signal_iq.pipelines p on p.id = d.pipeline_id
             where d.contacto_id = p_contacto_id
               and p.tipo = t.trigger_conditions->>'pipeline_tipo'
               and (t.trigger_conditions->>'etapa' is null or d.etapa = t.trigger_conditions->>'etapa')
           ))
      and not exists (
        select 1 from signal_iq.touchpoint_triggers tt
        where tt.contacto_id = p_contacto_id
          and tt.touchpoint_id = t.id
          and tt.triggered_at > now() - (coalesce((t.trigger_conditions->>'cooldown_dias')::int, 7) || ' days')::interval
      )
  ) t
  where t.rn = 1; -- como mucho un touchpoint por canal por evaluación, el de mayor priority
end;
$$ language plpgsql;
```

**Por qué "top 1 por canal" y no "todos los que matcheen":** si un contacto es
HOT y a la vez tiene frustración crítica, fácilmente puede matchear un
touchpoint de nutrición y uno de rescate de frustración al mismo tiempo.
Dispararlos ambos es mandarle dos mensajes por el mismo canal en el mismo
momento — se ve descoordinado. Se toma el de mayor `priority` por canal; si son
canales distintos (uno por WhatsApp, otro por email) sí pueden convivir, porque
no compiten por la misma bandeja.

### Se engancha en los triggers que ya existían

```sql
-- dentro de on_fragmento_voc_clasificado y on_new_evento (docs/06), agregar:
perform signal_iq.evaluar_touchpoints_contacto(new.contacto_id);
-- después de las dos llamadas a recalcular_score_contacto / recalcular_frustracion_contacto
```

(Ver el DDL completo actualizado en `supabase/schema.sql` — ahí está aplicado.)

## Ciclo de vida de `touchpoint_triggers`

```
pending  →  sent      (Zapier/Klaviyo confirma el envío)
         →  skipped   (dejó de tener sentido antes de enviarse)
```

Un trigger queda obsoleto en dos casos:

1. **El deal del contacto se cierra** (ganado o perdido) mientras el touchpoint
   sigue `pending` — no tiene sentido nutrir a alguien que ya decidió.
2. **Pasaron más de 48hs sin enviarse** — probablemente el webhook saliente
   falló; mandarlo tarde puede ser peor que no mandarlo.

El mismo trigger que descarta lo obsoleto también es el que **conecta el
kanban con las notificaciones**: cualquier cambio de etapa (no solo un cierre)
vuelve a evaluar los touchpoints del contacto — así mover una tarjeta de
"Cliente activo" a "En riesgo de churn" en el pipeline de Loyalty puede
disparar un push de retención sin ningún paso manual extra:

```sql
create or replace function signal_iq.on_deal_actualizado()
returns trigger as $$
begin
  if new.etapa_tipo in ('ganado','perdido') and old.etapa_tipo = 'abierta' then
    update signal_iq.touchpoint_triggers
    set status = 'skipped'
    where contacto_id = new.contacto_id and status = 'pending';
  end if;

  if new.etapa is distinct from old.etapa then
    perform signal_iq.evaluar_touchpoints_contacto(new.contacto_id);
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_on_deal_actualizado
after update on signal_iq.deals
for each row execute function signal_iq.on_deal_actualizado();
```

El caso 2 se resuelve con el mismo job de `pg_cron` que ya corre cada hora para
la capa 1 de frustración (`docs/06-formulas-scoring-frustracion.md`) — se le
suma una segunda sentencia:

```sql
-- dentro del mismo job programado 'recalcular-frustracion-inactivos', o uno propio:
update signal_iq.touchpoint_triggers
set status = 'skipped'
where status = 'pending' and triggered_at < now() - interval '48 hours';
```

## Endpoints

| Método | Endpoint | Qué hace | Quién lo llama |
|---|---|---|---|
| `GET` | `/touchpoints` | Lista los touchpoints configurados del proyecto | Frontend (pantalla de config) |
| `POST` | `/touchpoints` | Crea un touchpoint (name, channel, comb_gap_id, template_ref, trigger_conditions) | Frontend |
| `PATCH` | `/touchpoints/:id` | Edita condiciones o activa/pausa (`activo`) sin borrar | Frontend |
| `GET` | `/touchpoints/pending` | Fallback de reconciliación — Zapier puede pollear esto si el webhook saliente falló. El mecanismo primario sigue siendo el DB webhook de Supabase (ver `03-api-endpoints.md`) | Zapier |
| `POST` | `/webhooks/touchpoint-sent` | Callback de Zapier/Klaviyo confirmando el envío real → `status='sent'`, `sent_at=now()` | Zapier |
| `POST` | `/touchpoint-triggers/:id/skip` | Descarte manual desde la ficha de contacto ("no mandes esto, lo manejo yo") | Frontend |

## Dónde aparece en la UI

- **Ficha de Contacto**: sección "Próxima automatización" con el/los
  `touchpoint_triggers` en `pending` (con botón de descarte manual) + un
  historial colapsado de los `sent`/`skipped` anteriores, para que el equipo vea
  qué ya se le mandó a ese contacto y no lo duplique a mano.
- **Configuración → Touchpoints**: lista simple de touchpoints con toggle
  activo/pausado y sus condiciones en texto plano (ej: "Score ≥ 70 y
  clasificación HOT → WhatsApp: contacto directo"). **No es un flow builder
  visual** — es una lista de reglas, consistente con la decisión de scope de v1.

## Ejemplo: touchpoints de Tutellus atados a los `comb_gaps` ya sembrados

Los 5 `comb_gaps` globales (`docs/06`) ya tienen un `recommended_touchpoint_type`
como etiqueta (`email_explicativo`, `whatsapp_directo`, etc.) — acá se convierten
en touchpoints reales de un proyecto concreto, con su `template_ref` de
Klaviyo/Wati:

```sql
-- asumiendo v_project_id = el id del proyecto Tutellus ya creado
insert into signal_iq.touchpoints (project_id, name, channel, comb_gap_id, template_ref, trigger_conditions, priority) values
(
  :project_id, 'Rescate: riesgo legal', 'email',
  (select id from signal_iq.comb_gaps where voc_tag = 'riesgo_legal' and project_id is null),
  'klaviyo-tpl-riesgo-legal',
  '{"tags_requeridos": ["riesgo_legal"], "cooldown_dias": 5}'::jsonb,
  30
),
(
  :project_id, 'Contacto directo: intención de compra', 'whatsapp',
  (select id from signal_iq.comb_gaps where voc_tag = 'intencion_compra' and project_id is null),
  'wati-tpl-contacto-directo',
  '{"clasificacion": ["HOT"], "tags_requeridos": ["intencion_compra"], "cooldown_dias": 3}'::jsonb,
  40
),
(
  :project_id, 'Nutrición WARM genérica', 'email',
  null,
  'klaviyo-tpl-nutricion-warm',
  '{"clasificacion": ["WARM"], "cooldown_dias": 10}'::jsonb,
  10
),
(
  :project_id, 'Retención: en riesgo de churn', 'push',
  null,
  'push-tpl-retencion',
  '{"pipeline_tipo": "loyalty", "etapa": "En riesgo de churn", "cooldown_dias": 14}'::jsonb,
  50
);
```

Con esto: un contacto WARM que además manda un mensaje con `riesgo_legal` va a
disparar el touchpoint de rescate legal (priority 30) **en vez de** la nutrición
genérica (priority 10) — mismo canal (email), gana el de mayor prioridad — y si
además es HOT con `intencion_compra`, dispara el WhatsApp de contacto directo en
paralelo, porque es un canal distinto. Y si alguien en el kanban de Loyalty se
mueve a "En riesgo de churn" (manual, desde la UI, o porque un proceso externo
lo detecta), el push de retención se dispara solo — no compite por canal con
ninguno de los otros tres, así que puede convivir con cualquiera de ellos.
