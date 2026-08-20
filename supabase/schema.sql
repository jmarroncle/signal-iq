-- Signal IQ — schema v1
-- Pegar y correr en el SQL Editor del proyecto de Supabase "Behavioral platform"
-- (Project → SQL Editor → New query). Ver docs/02-data-model.md para el detalle
-- de cada tabla y docs/04-05 para el Constructor de Panel.
--
-- IMPORTANTE: este proyecto de Supabase ya aloja la vApp de Behavioral Design
-- en el schema `public` (incluye `public.projects`, sin relación con Signal IQ).
-- Todo Signal IQ vive en su propio schema para no chocar con eso.

create schema if not exists signal_iq;

-- ============================================
-- PROJECTS (tenant) — Tutellus es el primero
-- ============================================
create table signal_iq.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  config jsonb default '{}',
  esquema_config jsonb default '{}',
  crm_externo jsonb,
  created_at timestamptz default now()
);

-- ============================================
-- ESQUEMA_TEMPLATES (los 4 presets de Modo Selector)
-- ============================================
create table signal_iq.esquema_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  descripcion text,
  icono text,
  esquema_config jsonb not null,
  orden int default 0
);

-- ============================================
-- ESQUEMA_CHAT_SESSIONS
-- ============================================
create table signal_iq.esquema_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  mensajes jsonb default '[]',
  esquema_propuesto jsonb,
  estado text check (estado in ('en_progreso','confirmado','abandonado')) default 'en_progreso',
  modelo text default 'claude-sonnet-4-6',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- CONTACTOS
-- ============================================
create table signal_iq.contactos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  nombre text,
  email text,
  telefono text,
  fuente text,
  fecha_entrada timestamptz default now(),
  tipo text check (tipo in ('nuevo','recurrente')) default 'nuevo',
  previous_investments_count int default 0,
  previous_investments_total numeric default 0,
  current_score numeric,
  current_classification text check (current_classification in ('HOT','WARM','COLD')),
  current_frustration_index numeric,
  custom_fields jsonb default '{}',
  external_ids jsonb default '{}',
  crm_externo_id text,
  crm_externo_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, email)
);
create index contactos_proyecto_clasif_idx on signal_iq.contactos (project_id, current_classification);
create index contactos_proyecto_tipo_idx on signal_iq.contactos (project_id, tipo);
create index contactos_custom_fields_idx on signal_iq.contactos using gin (custom_fields);

-- ============================================
-- DEALS
-- ============================================
create table signal_iq.deals (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  etapa text not null,
  etapa_tipo text check (etapa_tipo in ('abierta','ganado','perdido')) default 'abierta',
  valor numeric,
  probabilidad numeric,
  fecha_cierre_estimada date,
  custom_fields jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index deals_proyecto_etapa_idx on signal_iq.deals (project_id, etapa);
create index deals_contacto_idx on signal_iq.deals (contacto_id);
create index deals_custom_fields_idx on signal_iq.deals using gin (custom_fields);

-- ============================================
-- EVENTOS
-- ============================================
create table signal_iq.eventos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references signal_iq.projects(id) not null,
  contacto_id uuid references signal_iq.contactos(id),
  anonymous_id text,
  canal text,
  fuente_integracion text not null,
  tipo_evento text not null,
  valor_numerico numeric,
  properties jsonb default '{}',
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
  canal text,
  fuente_evento_id uuid references signal_iq.eventos(id),
  texto_original text not null,
  idioma text,
  tag_semantico text,
  score_intensidad numeric,
  modelo_clasificacion text default 'claude-haiku-4-5-20251001',
  ocurrido_en timestamptz not null default now(),
  clasificado_en timestamptz,
  created_at timestamptz default now()
);
create index fragmentos_contacto_idx on signal_iq.fragmentos_voc (contacto_id);
create index fragmentos_proyecto_tiempo_idx on signal_iq.fragmentos_voc (project_id, ocurrido_en);

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
  inputs_snapshot jsonb,
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
  capa1_canal numeric,
  capa2_proceso numeric,
  capa3_voc numeric,
  frustration_index numeric not null,
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
  template_ref text,
  trigger_conditions jsonb
);

create table signal_iq.touchpoint_triggers (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  touchpoint_id uuid references signal_iq.touchpoints(id) not null,
  reason jsonb,
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

-- ============================================
-- SEED: los 4 templates del Modo Selector
-- ============================================
insert into signal_iq.esquema_templates (slug, nombre, descripcion, icono, esquema_config, orden) values
(
  'lanzamiento_producto',
  'Lanzamiento de producto',
  'Leads que asisten a webinars y después deciden invertir o comprar.',
  'rocket',
  '{
    "tipo_negocio": "lanzamiento_producto",
    "generado_por": "selector",
    "terminologia": {"contacto": "Lead", "deal": "Inversión"},
    "entidades": {
      "contacto": {
        "campos_custom": [
          {"clave": "webinar_asistido", "etiqueta": "Webinar al que asistió", "tipo": "texto"},
          {"clave": "monto_disponible_invertir", "etiqueta": "Monto disponible para invertir", "tipo": "numero"}
        ]
      },
      "deal": {
        "etapas_pipeline": [
          {"label": "Webinar asistido", "tipo": "abierta"},
          {"label": "Interesado", "tipo": "abierta"},
          {"label": "Propuesta enviada", "tipo": "abierta"},
          {"label": "Invertido", "tipo": "ganado"},
          {"label": "Perdido", "tipo": "perdido"}
        ],
        "campos_custom": [
          {"clave": "instrumento", "etiqueta": "Instrumento", "tipo": "seleccion", "opciones": ["Bono agrícola", "Token de cosecha"]}
        ]
      },
      "evento": {
        "canales_sugeridos": ["email", "whatsapp", "webinar", "web"],
        "tipos_evento_sugeridos": ["webinar_registro", "webinar_asistencia", "landing_visita", "form_submit"]
      },
      "fragmento_voc": {"tags_custom": []}
    }
  }'::jsonb,
  1
),
(
  'ecommerce',
  'Ecommerce',
  'Clientes que compran online, con carritos abandonados y valor de orden promedio.',
  'shopping-cart',
  '{
    "tipo_negocio": "ecommerce",
    "generado_por": "selector",
    "terminologia": {"contacto": "Cliente", "deal": "Orden"},
    "entidades": {
      "contacto": {
        "campos_custom": [
          {"clave": "aov", "etiqueta": "Valor promedio de orden (AOV)", "tipo": "numero"}
        ]
      },
      "deal": {
        "etapas_pipeline": [
          {"label": "Carrito iniciado", "tipo": "abierta"},
          {"label": "Carrito abandonado", "tipo": "abierta"},
          {"label": "Pagado", "tipo": "ganado"},
          {"label": "Cancelado", "tipo": "perdido"}
        ],
        "campos_custom": [
          {"clave": "monto_orden", "etiqueta": "Monto de la orden", "tipo": "numero"}
        ]
      },
      "evento": {
        "canales_sugeridos": ["email", "ads", "web"],
        "tipos_evento_sugeridos": ["carrito_agregado", "carrito_abandonado", "checkout_iniciado", "compra_completada"]
      },
      "fragmento_voc": {"tags_custom": []}
    }
  }'::jsonb,
  2
),
(
  'saas',
  'SaaS',
  'Usuarios en trial que convierten o hacen churn, con MRR por cuenta.',
  'layers',
  '{
    "tipo_negocio": "saas",
    "generado_por": "selector",
    "terminologia": {"contacto": "Usuario", "deal": "Suscripción"},
    "entidades": {
      "contacto": {
        "campos_custom": [
          {"clave": "trial_inicio", "etiqueta": "Inicio de trial", "tipo": "fecha"},
          {"clave": "trial_fin", "etiqueta": "Fin de trial", "tipo": "fecha"}
        ]
      },
      "deal": {
        "etapas_pipeline": [
          {"label": "Trial", "tipo": "abierta"},
          {"label": "Convertido", "tipo": "ganado"},
          {"label": "Churn", "tipo": "perdido"}
        ],
        "campos_custom": [
          {"clave": "mrr", "etiqueta": "MRR", "tipo": "numero"}
        ]
      },
      "evento": {
        "canales_sugeridos": ["email", "in_app", "web"],
        "tipos_evento_sugeridos": ["trial_iniciado", "feature_usada", "trial_por_vencer", "cancelacion"]
      },
      "fragmento_voc": {"tags_custom": []}
    }
  }'::jsonb,
  3
),
(
  'fintech',
  'Fintech',
  'Inversores evaluando instrumentos financieros según riesgo y rendimiento.',
  'trending-up',
  '{
    "tipo_negocio": "fintech",
    "generado_por": "selector",
    "terminologia": {"contacto": "Inversor", "deal": "Inversión"},
    "entidades": {
      "contacto": {
        "campos_custom": [
          {"clave": "perfil_riesgo", "etiqueta": "Perfil de riesgo", "tipo": "seleccion", "opciones": ["Conservador", "Moderado", "Agresivo"]}
        ]
      },
      "deal": {
        "etapas_pipeline": [
          {"label": "Prospecto", "tipo": "abierta"},
          {"label": "Documentación", "tipo": "abierta"},
          {"label": "Invertido", "tipo": "ganado"},
          {"label": "Descartado", "tipo": "perdido"}
        ],
        "campos_custom": [
          {"clave": "instrumento", "etiqueta": "Instrumento", "tipo": "texto"},
          {"clave": "apy", "etiqueta": "APY", "tipo": "numero"}
        ]
      },
      "evento": {
        "canales_sugeridos": ["email", "whatsapp", "web"],
        "tipos_evento_sugeridos": ["simulador_usado", "documentacion_enviada", "kyc_completado"]
      },
      "fragmento_voc": {"tags_custom": ["riesgo_regulatorio"]}
    }
  }'::jsonb,
  4
);
