-- Signal IQ — schema v1
-- Pegar y correr en el SQL Editor del proyecto de Supabase "Behavioral platform"
-- (Project → SQL Editor → New query). Ver docs/02-data-model.md para el detalle
-- de cada tabla.
--
-- IMPORTANTE: este proyecto de Supabase ya aloja la vApp de Behavioral Design
-- en el schema `public` (incluye `public.projects`, sin relación con Signal IQ).
-- Todo Signal IQ vive en su propio schema para no chocar con eso.

create schema if not exists signal_iq;

-- ============================================
-- PROJECTS (multi-tenant desde el día 1: Tutellus es el primero)
-- ============================================
create table signal_iq.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  config jsonb default '{}',
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
  external_ids jsonb default '{}',
  customer_type text check (customer_type in ('new','recurring')) default 'new',
  previous_investments_count int default 0,
  previous_investments_total numeric default 0,
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
  lead_id uuid references signal_iq.leads(id),
  anonymous_id text,
  event_source text not null,
  event_type text not null,
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
  source text not null,
  source_event_id uuid references signal_iq.eventos(id),
  raw_text text not null,
  language text,
  sentiment_score numeric,
  classification_model text default 'claude-haiku-4-5-20251001',
  classified_at timestamptz,
  created_at timestamptz default now()
);
create index fragmentos_lead_idx on signal_iq.fragmentos_voc (lead_id);

create table signal_iq.voc_tags (
  id uuid primary key default gen_random_uuid(),
  fragmento_id uuid references signal_iq.fragmentos_voc(id) not null,
  tag text not null,
  confidence numeric,
  created_at timestamptz default now()
);
create index voc_tags_tag_idx on signal_iq.voc_tags (tag);

-- ============================================
-- COMB_GAPS
-- ============================================
create table signal_iq.comb_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id),
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
  inputs_snapshot jsonb,
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
  capa1_canal numeric,
  capa2_proceso numeric,
  capa3_voc numeric,
  frustration_index numeric not null,
  alert_triggered boolean default false,
  computed_at timestamptz default now()
);
create index frustration_lead_time_idx on signal_iq.frustration_scores (lead_id, computed_at desc);

-- ============================================
-- TOUCHPOINTS
-- ============================================
create table signal_iq.touchpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  name text not null,
  channel text check (channel in ('email','whatsapp','sms')) not null,
  comb_gap_id uuid references signal_iq.comb_gaps(id),
  template_ref text,
  trigger_conditions jsonb
);

-- ============================================
-- TOUCHPOINT_TRIGGERS
-- ============================================
create table signal_iq.touchpoint_triggers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references signal_iq.leads(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  touchpoint_id uuid references signal_iq.touchpoints(id) not null,
  reason jsonb,
  status text check (status in ('pending','sent','skipped')) default 'pending',
  triggered_at timestamptz default now(),
  sent_at timestamptz
);
create index touchpoint_triggers_status_idx on signal_iq.touchpoint_triggers (status);

-- ============================================
-- ALERTS
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
