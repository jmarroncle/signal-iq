# Modelo de datos — Supabase / Postgres

El punto de partida (3 tablas: `leads` / `eventos` / `fragmentos_voc`) queda corto
en cuanto agregás dos cosas que hacen falta sí o sí:

- **Historial de scores** (para no perder la evolución de un lead en el tiempo —
  clave para cohortes en v2). Se resuelve con tablas append-only: nunca se pisa
  una fila, solo se agregan nuevas.
- **Tablas de referencia** (el mapeo COM-B, el catálogo de touchpoints).

## ⚠️ Namespace: schema `signal_iq`, no `public`

Este proyecto comparte la cuenta de Supabase "Behavioral platform" con la vApp de
Behavioral Design (ya tiene `public.projects` con otro propósito). Todas las tablas
de Signal IQ van en un schema propio para evitar colisiones:

```sql
create schema if not exists signal_iq;
```

El resto del DDL de este documento asume `search_path` apuntando a `signal_iq`,
o se referencia explícitamente como `signal_iq.<tabla>`.

## DDL completo

```sql
create schema if not exists signal_iq;

-- ============================================
-- PROJECTS (multi-tenant desde el día 1: Tutellus es el primero)
-- ============================================
create table signal_iq.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  config jsonb default '{}', -- pesos de scoring, overrides de mapeo COM-B
  created_at timestamptz default now()
);

-- ============================================
-- LEADS
-- ============================================
create table signal_iq.leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  email text,
  phone text,
  full_name text,
  external_ids jsonb default '{}', -- {klaviyo_id, wati_id, ga4_client_id, typeform_id}
  customer_type text check (customer_type in ('new','recurring')) default 'new',
  previous_investments_count int default 0,
  previous_investments_total numeric default 0,
  -- denormalizado para queries rápidas del dashboard (se recalcula desde
  -- lead_scores/frustration_scores vía trigger o job)
  current_score numeric,
  current_classification text check (current_classification in ('HOT','WARM','COLD')),
  current_frustration_index numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, email)
);
create index leads_project_class_idx on signal_iq.leads (project_id, current_classification);

-- ============================================
-- EVENTOS (raw stream desde Segment)
-- ============================================
create table signal_iq.eventos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  lead_id uuid references signal_iq.leads(id), -- null si aún es anónimo
  anonymous_id text, -- id de Segment antes de identificar al lead
  event_source text not null, -- 'klaviyo' | 'wati' | 'ga4' | 'typeform'
  event_type text not null,   -- 'email_open' | 'email_click' | 'whatsapp_reply' | 'form_submit' | 'landing_abandon'
  properties jsonb default '{}',
  occurred_at timestamptz not null,
  received_at timestamptz default now()
);
create index eventos_lead_time_idx on signal_iq.eventos (lead_id, occurred_at);
create index eventos_project_type_idx on signal_iq.eventos (project_id, event_type);

-- ============================================
-- FRAGMENTOS_VOC
-- ============================================
create table signal_iq.fragmentos_voc (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  lead_id uuid references signal_iq.leads(id) not null,
  source text not null, -- 'typeform' | 'email_reply' | 'whatsapp'
  source_event_id uuid references signal_iq.eventos(id),
  raw_text text not null,
  language text,
  sentiment_score numeric, -- -1 a 1
  classification_model text default 'claude-haiku-4-5-20251001', -- versión de prompt/modelo (auditoría)
  classified_at timestamptz,
  created_at timestamptz default now()
);
create index fragmentos_lead_idx on signal_iq.fragmentos_voc (lead_id);

-- tags como tabla propia: un fragmento puede tener varios tags con distinta confianza
create table signal_iq.voc_tags (
  id uuid primary key default gen_random_uuid(),
  fragmento_id uuid references signal_iq.fragmentos_voc(id) not null,
  tag text not null, -- 'confusion' | 'precio' | 'riesgo_legal' | 'intencion_compra' | 'proceso_complejo'
  confidence numeric,
  created_at timestamptz default now()
);
create index voc_tags_tag_idx on signal_iq.voc_tags (tag);

-- ============================================
-- COMB_GAPS (tabla de referencia: tag VOC -> brecha COM-B -> nudge)
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
-- LEAD_SCORES (historial append-only)
-- ============================================
create table signal_iq.lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references signal_iq.leads(id) not null,
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
create index lead_scores_lead_time_idx on signal_iq.lead_scores (lead_id, computed_at desc);

-- ============================================
-- FRUSTRATION_SCORES (historial append-only)
-- ============================================
create table signal_iq.frustration_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references signal_iq.leads(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  capa1_canal numeric,   -- comportamiento en mensajería
  capa2_proceso numeric, -- abandono landing/formulario
  capa3_voc numeric,     -- VOC directo
  frustration_index numeric not null, -- 0-100
  alert_triggered boolean default false,
  computed_at timestamptz default now()
);
create index frustration_lead_time_idx on signal_iq.frustration_scores (lead_id, computed_at desc);

-- ============================================
-- TOUCHPOINTS (catálogo de acciones posibles)
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

-- ============================================
-- TOUCHPOINT_TRIGGERS (log de disparos — el "motor" simplificado de v1)
-- ============================================
create table signal_iq.touchpoint_triggers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references signal_iq.leads(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  touchpoint_id uuid references signal_iq.touchpoints(id) not null,
  reason jsonb, -- qué score/frustración/gap lo disparó
  status text check (status in ('pending','sent','skipped')) default 'pending',
  triggered_at timestamptz default now(),
  sent_at timestamptz
);
create index touchpoint_triggers_status_idx on signal_iq.touchpoint_triggers (status);

-- ============================================
-- ALERTS (frustración en tiempo real)
-- ============================================
create table signal_iq.alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  lead_id uuid references signal_iq.leads(id) not null,
  frustration_score_id uuid references signal_iq.frustration_scores(id),
  severity text check (severity in ('warning','critical')) not null,
  channel_sent text[] default '{}',
  created_at timestamptz default now(),
  acknowledged_at timestamptz
);
```

## RLS (Row Level Security)

RLS son reglas que Postgres aplica automáticamente para que cada fila solo la vea
quien corresponde. Para v1, si el dashboard lo usa solo el equipo interno, alcanza
con una policy simple que filtra por `project_id` según el usuario autenticado —
no hace falta diseñar multi-tenant complejo todavía. El schema ya soporta agregar
más proyectos (más allá de Tutellus) sin necesidad de migración.
