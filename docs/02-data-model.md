# Modelo de datos — Supabase / Postgres

## Decisión de arquitectura: entidades fijas + esquema flexible por encima

El Constructor de Panel promete un "esquema adaptado" distinto por tipo de negocio
(ecommerce, SaaS, fintech, lanzamiento de producto, o lo que sea que describa el
Modo Chat). La tentación es generar **tablas distintas por cuenta** — pero eso
rompe el producto: el scoring, la frustración y el mapeo COM-B necesitan calcularse
igual para cualquier cliente, y mantener un schema de base de datos distinto por
tenant es inmantenible.

La solución (el mismo patrón que usan HubSpot o Pipedrive para "propiedades
personalizadas"): **4 entidades core fijas para todas las cuentas** —
`contactos`, `deals`, `eventos`, `fragmentos_voc` — con una columna `custom_fields
jsonb` en las dos primeras para lo que varía por negocio. Lo que el Constructor de
Panel genera (por Chat o por Selector) no crea tablas: escribe un objeto de
configuración (`esquema_config`, ver más abajo) que define qué campos custom
existen, cómo se llaman las etapas del pipeline de `deals`, y qué terminología usa
la UI ("Contacto" vs "Inversor", por ejemplo). El motor de scoring/frustración/COM-B
ignora `custom_fields` por completo — corre siempre sobre las mismas columnas fijas.

## Historial append-only y tablas de referencia

Además de las 4 entidades core hacen falta:

- **Historial de scores** (para no perder la evolución de un contacto en el tiempo
  — clave para cohortes en v2). Se resuelve con tablas append-only: nunca se pisa
  una fila, solo se agregan nuevas.
- **Tablas de referencia** (el mapeo COM-B, el catálogo de touchpoints, los
  templates del Constructor de Panel).

## ⚠️ Namespace: schema `signal_iq`, no `public`

Este proyecto comparte la cuenta de Supabase "Behavioral platform" con la vApp de
Behavioral Design (ya tiene `public.projects` con otro propósito). Todas las tablas
de Signal IQ van en un schema propio para evitar colisiones:

```sql
create schema if not exists signal_iq;
```

## Forma de `esquema_config` (lo que genera el Constructor de Panel)

```json
{
  "tipo_negocio": "lanzamiento_producto",
  "generado_por": "chat",
  "terminologia": { "contacto": "Inversor", "deal": "Inversión" },
  "entidades": {
    "contacto": {
      "campos_custom": [
        { "clave": "webinar_asistido", "etiqueta": "Webinar al que asistió", "tipo": "texto" },
        { "clave": "monto_disponible_invertir", "etiqueta": "Monto disponible para invertir", "tipo": "numero" }
      ]
    },
    "deal": {
      "etapas_pipeline": [
        { "label": "Webinar asistido", "tipo": "abierta" },
        { "label": "Interesado", "tipo": "abierta" },
        { "label": "Propuesta enviada", "tipo": "abierta" },
        { "label": "Invertido", "tipo": "ganado" },
        { "label": "Perdido", "tipo": "perdido" }
      ],
      "campos_custom": [
        { "clave": "instrumento", "etiqueta": "Instrumento", "tipo": "seleccion",
          "opciones": ["Bono agrícola", "Token de cosecha"] }
      ]
    },
    "evento": {
      "canales_sugeridos": ["email", "whatsapp", "webinar", "web"],
      "tipos_evento_sugeridos": ["webinar_registro", "webinar_asistencia", "landing_visita", "form_submit"]
    },
    "fragmento_voc": { "tags_custom": [] }
  }
}
```

`tipo` de cada campo custom es uno de: `texto | numero | fecha | booleano | seleccion`
(con `opciones` solo si es `seleccion`). El `tipo` de cada etapa del pipeline es
`abierta | ganado | perdido` — esto es lo que le permite al sistema saber qué
etapas están "cerradas" sin asumir nombres literales como "Invertido", que van a
variar según el negocio (ver el trigger de `probabilidad` más abajo).

## DDL completo

```sql
create schema if not exists signal_iq;

-- ============================================
-- PROJECTS (tenant) — Tutellus es el primero
-- ============================================
create table signal_iq.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  config jsonb default '{}',          -- pesos de scoring, overrides de mapeo COM-B
  esquema_config jsonb default '{}',  -- ver forma arriba — lo genera el Constructor de Panel
  crm_externo jsonb,                  -- null = usa CRM nativo. Si no: {"proveedor":"hubspot","estado":"conectado",...}
  created_at timestamptz default now()
);

-- ============================================
-- ESQUEMA_TEMPLATES (los 4 presets de Modo Selector)
-- ============================================
create table signal_iq.esquema_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, -- 'lanzamiento_producto' | 'ecommerce' | 'saas' | 'fintech'
  nombre text not null,
  descripcion text,
  icono text,
  esquema_config jsonb not null, -- misma forma que projects.esquema_config
  orden int default 0
);

-- ============================================
-- ESQUEMA_CHAT_SESSIONS (historial del Modo Chat: loop de regenerar + auditoría)
-- ============================================
create table signal_iq.esquema_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  mensajes jsonb default '[]',   -- [{role, content}] — historial completo enviado a Claude
  esquema_propuesto jsonb,       -- última propuesta, antes de confirmar
  estado text check (estado in ('en_progreso','confirmado','abandonado')) default 'en_progreso',
  modelo text default 'claude-sonnet-4-6',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- CONTACTOS (entidad core del CRM nativo)
-- ============================================
create table signal_iq.contactos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  nombre text,
  email text,
  telefono text,
  fuente text, -- 'organico' | 'paid' | 'referido' | 'webinar' | ... (libre, sugerido por esquema_config)
  fecha_entrada timestamptz default now(),
  tipo text check (tipo in ('nuevo','recurrente')) default 'nuevo',
  previous_investments_count int default 0,
  previous_investments_total numeric default 0,
  -- denormalizado, sincronizado por trigger desde contacto_scores / frustration_scores
  current_score numeric,
  current_classification text check (current_classification in ('HOT','WARM','COLD')),
  current_frustration_index numeric,
  custom_fields jsonb default '{}', -- definidos en esquema_config.entidades.contacto.campos_custom
  external_ids jsonb default '{}',  -- {klaviyo_id, wati_id, ga4_client_id, typeform_id}
  crm_externo_id text,              -- id en el CRM externo, si está conectado (v2)
  crm_externo_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, email)
);
create index contactos_proyecto_clasif_idx on signal_iq.contactos (project_id, current_classification);
create index contactos_proyecto_tipo_idx on signal_iq.contactos (project_id, tipo);
create index contactos_custom_fields_idx on signal_iq.contactos using gin (custom_fields);

-- ============================================
-- PIPELINES — un proyecto puede tener más de un pipeline a la vez (ej. Loyalty
-- como principal + Ventas como secundario). Cada uno define sus propias etapas
-- ============================================
create table signal_iq.pipelines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  nombre text not null,
  tipo text check (tipo in ('loyalty','ventas','custom')) not null,
  es_principal boolean default false, -- cuál se abre por default en el kanban
  etapas jsonb not null, -- [{label, tipo: 'abierta'|'ganado'|'perdido'}, ...]
  orden int default 0
);
create index pipelines_proyecto_idx on signal_iq.pipelines (project_id);

-- ============================================
-- DEALS — la posición de un contacto DENTRO de un pipeline específico
-- ============================================
create table signal_iq.deals (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  pipeline_id uuid references signal_iq.pipelines(id) not null,
  etapa text not null,      -- label libre, viene de pipelines.etapas
  etapa_tipo text check (etapa_tipo in ('abierta','ganado','perdido')) default 'abierta',
  valor numeric,
  probabilidad numeric,     -- 0-100, sincronizada por trigger desde contacto_scores — nunca manual
  fecha_cierre_estimada date,
  custom_fields jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index deals_proyecto_etapa_idx on signal_iq.deals (project_id, pipeline_id, etapa); -- kanban
create index deals_contacto_idx on signal_iq.deals (contacto_id);
create index deals_custom_fields_idx on signal_iq.deals using gin (custom_fields);

-- ============================================
-- EVENTOS (raw stream desde Segment)
-- ============================================
create table signal_iq.eventos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  contacto_id uuid references signal_iq.contactos(id), -- null si aún es anónimo
  anonymous_id text,        -- id de Segment antes de identificar al contacto
  canal text,                -- 'email' | 'whatsapp' | 'ads' | 'web' (canal de negocio, para la UI)
  fuente_integracion text not null, -- 'klaviyo' | 'wati' | 'ga4' | 'typeform' (origen técnico)
  tipo_evento text not null, -- 'email_open' | 'form_submit' | 'landing_abandon' | ...
  valor_numerico numeric,    -- monto, tiempo en página, etc. (opcional, según tipo_evento)
  properties jsonb default '{}', -- payload crudo completo
  ocurrido_en timestamptz not null,
  created_at timestamptz default now()
);
create index eventos_contacto_tiempo_idx on signal_iq.eventos (contacto_id, ocurrido_en);
create index eventos_proyecto_tipo_idx on signal_iq.eventos (project_id, tipo_evento);

-- ============================================
-- FRAGMENTOS_VOC
-- ============================================
create table signal_iq.fragmentos_voc (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  contacto_id uuid references signal_iq.contactos(id) not null,
  canal text, -- 'email' | 'whatsapp' | 'formulario'
  fuente_evento_id uuid references signal_iq.eventos(id),
  texto_original text not null,
  idioma text,
  tag_semantico text,    -- tag dominante (mayor confianza): 'confusion'|'precio'|'riesgo_legal'|'intencion_compra'|'proceso_complejo'|custom
  score_intensidad numeric, -- 0-100, magnitud de la señal (la dirección la da tag_semantico)
  modelo_clasificacion text default 'claude-haiku-4-5-20251001',
  ocurrido_en timestamptz not null default now(),
  clasificado_en timestamptz,
  created_at timestamptz default now()
);
create index fragmentos_contacto_idx on signal_iq.fragmentos_voc (contacto_id);
create index fragmentos_proyecto_tiempo_idx on signal_iq.fragmentos_voc (project_id, ocurrido_en);

-- tags secundarios: un fragmento puede tocar más de una brecha COM-B a la vez.
-- tag_semantico arriba es el dominante (para filtrar rápido en la ficha de contacto);
-- esta tabla guarda el detalle completo cuando hay más de un tag con confianza relevante.
create table signal_iq.voc_tags (
  id uuid primary key default gen_random_uuid(),
  fragmento_id uuid references signal_iq.fragmentos_voc(id) not null,
  tag text not null,
  confidence numeric,
  created_at timestamptz default now()
);
create index voc_tags_tag_idx on signal_iq.voc_tags (tag);

-- ============================================
-- COMB_GAPS (tag VOC -> brecha COM-B -> nudge)
-- ============================================
create table signal_iq.comb_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id), -- null = default global
  voc_tag text not null,
  comb_dimension text check (comb_dimension in ('capability','opportunity','motivation')) not null,
  gap_description text,
  recommended_nudge text,
  recommended_touchpoint_type text,
  priority int default 0
);

-- ============================================
-- CONTACTO_SCORES (historial append-only)
-- ============================================
create table signal_iq.contacto_scores (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  demographic_score numeric,
  behavior_score numeric,
  voc_score numeric,
  recurrence_bonus numeric,
  total_score numeric not null,
  classification text check (classification in ('HOT','WARM','COLD')) not null,
  inputs_snapshot jsonb, -- qué eventos/fragmentos entraron en el cálculo (debug)
  computed_at timestamptz default now()
);
create index contacto_scores_contacto_tiempo_idx on signal_iq.contacto_scores (contacto_id, computed_at desc);

-- ============================================
-- FRUSTRATION_SCORES (historial append-only)
-- ============================================
create table signal_iq.frustration_scores (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  capa1_canal numeric,   -- comportamiento en mensajería
  capa2_proceso numeric, -- abandono landing/formulario
  capa3_voc numeric,     -- VOC directo
  frustration_index numeric not null, -- 0-100
  alert_triggered boolean default false,
  computed_at timestamptz default now()
);
create index frustration_contacto_tiempo_idx on signal_iq.frustration_scores (contacto_id, computed_at desc);

-- ============================================
-- TOUCHPOINTS / TOUCHPOINT_TRIGGERS / ALERTS
-- ============================================
create table signal_iq.touchpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  name text not null,
  channel text check (channel in ('email','whatsapp','sms')) not null,
  comb_gap_id uuid references signal_iq.comb_gaps(id),
  template_ref text, -- referencia a template en Klaviyo/Wati
  trigger_conditions jsonb -- {score_min, score_max, frustration_min, tags: [...]}
);

create table signal_iq.touchpoint_triggers (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  touchpoint_id uuid references signal_iq.touchpoints(id) not null,
  reason jsonb, -- qué score/frustración/gap lo disparó
  status text check (status in ('pending','sent','skipped')) default 'pending',
  triggered_at timestamptz default now(),
  sent_at timestamptz
);
create index touchpoint_triggers_status_idx on signal_iq.touchpoint_triggers (status);

create table signal_iq.alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  contacto_id uuid references signal_iq.contactos(id) not null,
  frustration_score_id uuid references signal_iq.frustration_scores(id),
  severity text check (severity in ('warning','critical')) not null,
  channel_sent text[] default '{}',
  created_at timestamptz default now(),
  acknowledged_at timestamptz
);

-- ============================================
-- TRIGGERS: sincronizar denormalizados + probabilidad de deals
-- ============================================
create or replace function signal_iq.on_new_contacto_score()
returns trigger as $$
begin
  update signal_iq.contactos
  set current_score = new.total_score,
      current_classification = new.classification,
      updated_at = now()
  where id = new.contacto_id;

  -- la probabilidad de un deal abierto sigue al score del contacto — nunca se
  -- edita a mano. etapa_tipo (no el nombre de la etapa) decide qué deals están
  -- cerrados, porque las etapas son texto libre definido por esquema_config.
  update signal_iq.deals
  set probabilidad = round(new.total_score, 2),
      updated_at = now()
  where contacto_id = new.contacto_id
    and etapa_tipo = 'abierta';

  return new;
end;
$$ language plpgsql;

create trigger trg_on_new_contacto_score
after insert on signal_iq.contacto_scores
for each row execute function signal_iq.on_new_contacto_score();

create or replace function signal_iq.on_new_frustration_score()
returns trigger as $$
begin
  update signal_iq.contactos
  set current_frustration_index = new.frustration_index,
      updated_at = now()
  where id = new.contacto_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_on_new_frustration_score
after insert on signal_iq.frustration_scores
for each row execute function signal_iq.on_new_frustration_score();

-- ============================================
-- VISTA: Actividad global (timeline del CRM nativo)
-- ============================================
create view signal_iq.actividad_global as
select e.id, e.project_id, e.contacto_id, e.ocurrido_en,
       'evento'::text as origen, e.tipo_evento as tipo, e.canal, null::text as detalle
from signal_iq.eventos e
union all
select f.id, f.project_id, f.contacto_id, f.ocurrido_en,
       'voc'::text as origen, f.tag_semantico as tipo, f.canal, f.texto_original as detalle
from signal_iq.fragmentos_voc f
union all
select d.id, d.project_id, d.contacto_id, d.updated_at,
       'deal'::text as origen, d.etapa as tipo, null::text as canal, null::text as detalle
from signal_iq.deals d;
```

## Cómo esto potencia las 4 vistas del CRM nativo

| Vista | De dónde sale |
|---|---|
| **Contactos** (tabla filtrable) | `select * from contactos where project_id = $1` con filtros sobre `current_classification`, `tipo`, `current_score`, `current_frustration_index` — todos indexados |
| **Pipeline kanban** | `select * from deals where pipeline_id = $1 group by etapa` — columnas = las `etapas` definidas en `pipelines`. El proyecto puede tener más de un pipeline (`es_principal` decide cuál se abre por default — ver más abajo) |
| **Actividad global** | `select * from actividad_global where project_id = $1 and ocurrido_en >= current_date order by ocurrido_en desc` |
| **Ficha de contacto** | `contactos` (fila) + `contacto_scores`/`frustration_scores` (última fila, para el desglose) + `fragmentos_voc` (historial VOC) + `comb_gaps` (join por el tag dominante activo → acción recomendada) + `deals` del contacto en cada pipeline |

### Loyalty como pipeline principal

Un mismo contacto puede tener una fila en `deals` por cada pipeline en el que
participa — no es "uno o el otro". El flujo típico: un contacto avanza por el
pipeline de **Ventas** (`Webinar asistido → Interesado → Propuesta enviada →
Invertido`), y al llegar a `Invertido` (etapa_tipo `ganado`) se crea una fila
nueva para ese mismo contacto en el pipeline de **Loyalty** (`Cliente activo →
En riesgo de churn → Reactivado → Embajador`), donde vive el resto de su
relación con el negocio. `ganado`/`perdido` en loyalty no significan "cerró una
venta" — significan el mejor y el peor desenlace posibles de la relación
(`Embajador` = `ganado`, `Perdido/Churn` = `perdido`); el resto de las etapas
son `abierta`, incluso pudiendo ir y volver entre ellas (a diferencia de ventas,
loyalty no es un funnel que solo avanza).

Mover una tarjeta de etapa en cualquier pipeline dispara el motor de
Touchpoints (`docs/08`) — es lo que permite que "mover a `En riesgo de churn`"
dispare automáticamente una notificación, sin ningún paso manual extra.

## RLS (Row Level Security)

RLS son reglas que Postgres aplica automáticamente para que cada fila solo la vea
quien corresponde. Para v1, si el dashboard lo usa solo el equipo interno, alcanza
con una policy simple que filtra por `project_id` según el usuario autenticado —
no hace falta diseñar multi-tenant complejo todavía. El schema ya soporta agregar
más proyectos (más allá de Tutellus) sin necesidad de migración.
