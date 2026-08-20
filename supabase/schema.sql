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
  priority int default 0,
  polaridad_score numeric -- -1 a 1: cuánto acerca (+) o aleja (-) de la compra este tag. Ver docs/06.
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
  computed_at timestamptz default clock_timestamp() -- NO now(): now() queda fijo durante toda
    -- la transacción, y una sola corrida de eventos/VOC puede disparar varios recálculos
    -- en cascada -- con now() todas esas filas empatan en el mismo timestamp y "traeme
    -- la última" queda indefinido. clock_timestamp() sí avanza en cada llamada.
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
  computed_at timestamptz default clock_timestamp() -- ver nota en contacto_scores
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
  trigger_conditions jsonb,
  priority int default 0, -- desempate cuando varios touchpoints matchean en el mismo canal a la vez
  activo boolean default true -- pausar sin borrar
);
create index touchpoints_proyecto_activo_idx on signal_iq.touchpoints (project_id, activo);

create table signal_iq.touchpoint_triggers (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references signal_iq.contactos(id) not null,
  project_id uuid references signal_iq.projects(id) not null,
  touchpoint_id uuid references signal_iq.touchpoints(id) not null,
  reason jsonb,
  status text check (status in ('pending','sent','skipped')) default 'pending',
  triggered_at timestamptz default clock_timestamp(), -- ver nota en contacto_scores
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

-- ============================================
-- SEED: comb_gaps globales (los 5 tags base, project_id null = default para todos)
-- ============================================
insert into signal_iq.comb_gaps (project_id, voc_tag, comb_dimension, gap_description, recommended_nudge, recommended_touchpoint_type, priority, polaridad_score) values
(null, 'confusion', 'capability', 'No entiende un paso del proceso o del producto', 'Simplificar la explicación / dar un ejemplo concreto del paso que genera dudas', 'email_explicativo', 10, -0.2),
(null, 'precio', 'motivation', 'Duda si el valor justifica el precio', 'Mostrar comparación de valor / anclar el precio contra el beneficio esperado', 'email_valor', 20, 0.3),
(null, 'riesgo_legal', 'opportunity', 'Percibe una barrera regulatoria o de confianza para avanzar', 'Enviar documentación regulatoria / testimonios de cumplimiento', 'email_legal', 30, -0.6),
(null, 'intencion_compra', 'motivation', 'Está listo para decidir, falta remover la última fricción', 'Contacto directo inmediato, remover fricción final', 'whatsapp_directo', 40, 1.0),
(null, 'proceso_complejo', 'capability', 'El proceso operativo (formulario, pasos) le resulta pesado', 'Ofrecer ayuda guiada / llamada de onboarding', 'llamada_soporte', 15, -0.3);

-- ============================================
-- WIKI_ARTICLES
-- ============================================
create table signal_iq.wiki_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titulo text not null,
  categoria text,
  contenido_md text not null,
  metricas_relacionadas text[],
  orden int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into signal_iq.wiki_articles (slug, titulo, categoria, contenido_md, metricas_relacionadas, orden) values (
  'lead-score',
  '¿Qué es el Lead Score y por qué importa?',
  'scoring',
  $md$
## ¿Qué es?

Un número de 0 a 100 que resume, para cada contacto, qué tan cerca está de
comprar o invertir — combinando **quién es** (perfil), **qué hace**
(comportamiento) y **qué dice** (lenguaje real, VOC), más un plus si ya es
cliente. Se traduce en tres categorías simples:

- **HOT** — listo para que lo contacten ahora
- **WARM** — interesado, necesita más nutrición
- **COLD** — temprano en el proceso todavía

## ¿Cómo se arma? (versión simple)

- **20% Perfil** — de dónde vino el contacto y su capacidad de inversión
- **35% Comportamiento** — qué tan activo está (asistió a un webinar, hizo clic,
  visitó la página) — cuenta más lo reciente que lo viejo
- **35% Lo que dice** — si sus mensajes muestran intención de compra o dudas que
  lo están frenando
- **+10 extra** si ya es cliente y compró/invirtió antes

## ¿Por qué importa para el negocio?

Sin esto, el equipo trata a todos los leads igual — le dedica el mismo tiempo a
alguien que recién llegó que a alguien listo para cerrar. El score dice a quién
llamar primero. **Un lead HOT que se enfría por falta de atención es una venta
que sí se podía haber cerrado.**

## ¿Cómo actuar?

- **HOT** → contacto directo y rápido (llamada, WhatsApp personalizado). No
  dejarlo esperando en una secuencia de email genérica.
- **WARM** → nutrición activa, contenido que resuelve la brecha detectada (ver
  la Acción Recomendada en su ficha).
- **COLD** → nutrición pasiva (newsletter, contenido educativo). No gastar
  tiempo comercial todavía.
  $md$,
  array['current_score','current_classification'],
  1
);

insert into signal_iq.wiki_articles (slug, titulo, categoria, contenido_md, metricas_relacionadas, orden) values (
  'frustration-index',
  '¿Qué es el Índice de Frustración y por qué importa?',
  'frustracion',
  $md$
## ¿Qué es?

Un número de 0 a 100 que mide qué tan trabado o incómodo se siente un contacto
en su proceso de decisión. **No es lo opuesto al Lead Score.** Un contacto puede
ser HOT (muy interesado) y a la vez tener frustración alta — interesado, pero
trabado en un problema puntual, por ejemplo un paso del formulario que no
entiende. Cuando pasa eso es la señal más urgente de todas: alguien que quería
avanzar y algo se lo impidió.

## ¿De dónde sale?

Se arma con tres capas de evidencia, de la más indirecta a la más directa:

1. **Comportamiento en el canal de mensajería** — manda varios mensajes seguidos
   sin respuesta, o estaba muy activo y de golpe desaparece
2. **Fricción en el proceso** — abandona un formulario o un checkout más de
   una vez
3. **Lo que dice explícitamente** — palabras de confusión, objeciones legales,
   quejas de que el proceso es complicado

La capa 3 pesa más que las otras dos porque es la señal más confiable — no es
una inferencia de comportamiento, es lo que la persona realmente escribió.

## ¿Por qué importa para el negocio?

Un contacto frustrado que no se atiende a tiempo se enfría o, peor, se va y deja
una mala referencia. Detectarlo en tiempo real — antes de que decida
abandonar — es la diferencia entre salvar una venta y perderla en silencio. Sin
esta señal, el equipo nunca se entera de que casi la pierde.

## ¿Cómo actuar?

- **Alerta warning** (índice ≥ 50) → revisar el caso, entender qué lo trabó.
- **Alerta critical** (índice ≥ 75) → contacto humano inmediato, no una
  automatización. A esta altura un mensaje genérico puede empeorar la
  frustración en vez de resolverla.
  $md$,
  array['current_frustration_index'],
  2
);

insert into signal_iq.wiki_articles (slug, titulo, categoria, contenido_md, metricas_relacionadas, orden) values (
  'com-b',
  '¿Qué es COM-B y por qué importa?',
  'comb',
  $md$
## ¿Qué es?

COM-B es un modelo de comportamiento que dice algo simple: para que una persona
haga algo (en este caso, decidir invertir o comprar) tienen que estar presentes
**tres condiciones a la vez**:

- **Capability** (capacidad) — ¿puede hacerlo? ¿entiende cómo?
- **Opportunity** (oportunidad) — ¿el contexto se lo permite? ¿confía en que es
  seguro/legal/posible?
- **Motivation** (motivación) — ¿quiere hacerlo? ¿el valor le convence?

Si falta cualquiera de las tres, el comportamiento **no pasa** — no importa
cuánto sobren las otras dos. Alguien puede estar 100% motivado a invertir y
frenarse igual porque no entiende un paso del proceso (falta capability).

## ¿Cómo se arma?

Los mismos 5 tags que clasifican el lenguaje VOC ya vienen mapeados a una de las
tres dimensiones:

| Tag VOC | Dimensión COM-B | Qué significa |
|---|---|---|
| `confusion` | Capability | no entiende un paso del proceso o del producto |
| `proceso_complejo` | Capability | el proceso operativo le resulta pesado |
| `riesgo_legal` | Opportunity | percibe una barrera regulatoria o de confianza |
| `precio` | Motivation | duda si el valor justifica el costo |
| `intencion_compra` | Motivation | ya quiere, falta remover la última fricción |

Cuando un contacto tiene un fragmento VOC reciente con alguno de estos tags, el
sistema resuelve automáticamente cuál es su brecha activa y sugiere el nudge
(empujón conductual) correspondiente — eso es lo que aparece como **Acción
Recomendada** en su ficha.

## ¿Por qué importa para el negocio?

Clasificar el lenguaje VOC sin COM-B te da un diagnóstico sin receta: "esta
persona está confundida" no dice qué hacer con eso. COM-B traduce cada tipo de
fricción en una clase de solución distinta — y confundirlas cuesta plata:

- A alguien que **no entiende** (Capability) mandarle más información no ayuda —
  necesita información **más clara**, no más.
- A alguien que **no confía** en el marco legal (Opportunity) mandarle una
  explicación del producto no ayuda — necesita **evidencia externa** (garantías,
  documentación, testimonios), no más argumento de venta.
- A alguien que **entiende y confía pero no está convencido** (Motivation)
  mandarle documentación legal no ayuda — necesita ver el **valor**, no más
  tranquilidad.

Mandar el mismo email genérico a los tres es gastar presupuesto de contenido sin
mover a nadie.

## ¿Cómo actuar?

- **Capability** (confusión / proceso complejo) → simplificar, dar un ejemplo
  concreto, ofrecer ayuda guiada.
- **Opportunity** (riesgo legal / barrera externa) → remover la barrera con
  evidencia: documentación, testimonios, garantías.
- **Motivation** (precio / intención de compra) → reforzar el valor percibido, o
  si ya está convencido, contacto directo para remover la última fricción.
  $md$,
  array['tag_semantico','comb_dimension'],
  3
);

-- ============================================
-- FUNCIONES: LEAD SCORE
-- ============================================
create or replace function signal_iq.calcular_demographic_score(p_contacto_id uuid)
returns numeric as $$
declare
  v_contacto signal_iq.contactos%rowtype;
  v_config jsonb;
  v_fuente_score numeric;
  v_capacidad_score numeric;
  v_monto numeric;
begin
  select * into v_contacto from signal_iq.contactos where id = p_contacto_id;
  select config into v_config from signal_iq.projects where id = v_contacto.project_id;

  v_fuente_score := coalesce(
    (v_config->'scoring'->'fuente_pesos'->>v_contacto.fuente)::numeric, 50);

  v_monto := (v_contacto.custom_fields->>'monto_disponible_invertir')::numeric;
  if v_monto is not null then
    v_capacidad_score := least(100,
      v_monto / coalesce((v_config->'scoring'->>'umbral_capacidad_alta')::numeric, 10000) * 100);
  else
    v_capacidad_score := 50;
  end if;

  return round(v_fuente_score * 0.6 + v_capacidad_score * 0.4, 2);
end;
$$ language plpgsql;

create or replace function signal_iq.calcular_behavior_score(p_contacto_id uuid)
returns numeric as $$
declare
  v_project_id uuid;
  v_pesos jsonb;
  v_score numeric;
begin
  select project_id into v_project_id from signal_iq.contactos where id = p_contacto_id;
  select coalesce(config->'scoring'->'eventos_pesos', '{}'::jsonb) into v_pesos
  from signal_iq.projects where id = v_project_id;

  select coalesce(sum(
    coalesce((v_pesos->>tipo_evento)::numeric, 1)
    * power(0.5, extract(epoch from (now() - ocurrido_en)) / 86400.0 / 7)
  ), 0)
  into v_score
  from signal_iq.eventos
  where contacto_id = p_contacto_id
    and ocurrido_en > now() - interval '60 days';

  return least(100, round(v_score, 2));
end;
$$ language plpgsql;

create or replace function signal_iq.calcular_voc_score(p_contacto_id uuid)
returns numeric as $$
declare
  v_project_id uuid;
  v_score numeric;
begin
  select project_id into v_project_id from signal_iq.contactos where id = p_contacto_id;

  select coalesce(
    sum(
      (50 + coalesce(g.polaridad_score, 0) * f.score_intensidad * 0.5)
      * power(0.5, extract(epoch from (now() - f.ocurrido_en)) / 86400.0 / 7)
    ) / nullif(sum(power(0.5, extract(epoch from (now() - f.ocurrido_en)) / 86400.0 / 7)), 0)
  , 50)
  into v_score
  from signal_iq.fragmentos_voc f
  left join signal_iq.comb_gaps g
    on g.voc_tag = f.tag_semantico and (g.project_id = v_project_id or g.project_id is null)
  where f.contacto_id = p_contacto_id
    and f.ocurrido_en > now() - interval '60 days';

  return round(greatest(0, least(100, v_score)), 2);
end;
$$ language plpgsql;

create or replace function signal_iq.calcular_recurrence_bonus(p_contacto_id uuid)
returns numeric as $$
declare
  v_contacto signal_iq.contactos%rowtype;
begin
  select * into v_contacto from signal_iq.contactos where id = p_contacto_id;
  if v_contacto.tipo != 'recurrente' then
    return 0;
  end if;
  return least(10, 4 + v_contacto.previous_investments_count * 3);
end;
$$ language plpgsql;

create or replace function signal_iq.recalcular_score_contacto(p_contacto_id uuid)
returns void as $$
declare
  v_project_id uuid;
  v_config jsonb;
  v_demo numeric;
  v_beh numeric;
  v_voc numeric;
  v_bonus numeric;
  v_total numeric;
  v_class text;
begin
  select project_id into v_project_id from signal_iq.contactos where id = p_contacto_id;
  select config into v_config from signal_iq.projects where id = v_project_id;

  v_demo := signal_iq.calcular_demographic_score(p_contacto_id);
  v_beh := signal_iq.calcular_behavior_score(p_contacto_id);
  v_voc := signal_iq.calcular_voc_score(p_contacto_id);
  v_bonus := signal_iq.calcular_recurrence_bonus(p_contacto_id);

  v_total := least(100,
    v_demo * coalesce((v_config->'scoring'->'pesos'->>'demografico')::numeric, 0.20) +
    v_beh  * coalesce((v_config->'scoring'->'pesos'->>'comportamiento')::numeric, 0.35) +
    v_voc  * coalesce((v_config->'scoring'->'pesos'->>'voc')::numeric, 0.35) +
    v_bonus
  );

  v_class := case
    when v_total >= coalesce((v_config->'scoring'->>'umbral_hot')::numeric, 70) then 'HOT'
    when v_total >= coalesce((v_config->'scoring'->>'umbral_warm')::numeric, 40) then 'WARM'
    else 'COLD'
  end;

  insert into signal_iq.contacto_scores
    (contacto_id, project_id, demographic_score, behavior_score, voc_score, recurrence_bonus, total_score, classification, inputs_snapshot)
  values
    (p_contacto_id, v_project_id, v_demo, v_beh, v_voc, v_bonus, v_total, v_class,
     jsonb_build_object('calculado_en', now()));
end;
$$ language plpgsql;

-- ============================================
-- FUNCIONES: FRUSTRATION INDEX
-- ============================================
create or replace function signal_iq.calcular_capa1_canal(p_contacto_id uuid)
returns numeric as $$
declare
  v_rafaga_count int;
  v_actividad_reciente int;
  v_actividad_previa int;
  v_rafaga_score numeric := 0;
  v_caida numeric := 0;
begin
  select count(*) into v_rafaga_count from signal_iq.eventos
  where contacto_id = p_contacto_id and canal in ('whatsapp','email')
    and ocurrido_en > now() - interval '1 hour';
  if v_rafaga_count > 3 then
    v_rafaga_score := least(50, (v_rafaga_count - 3) * 15);
  end if;

  select count(*) into v_actividad_reciente from signal_iq.eventos
  where contacto_id = p_contacto_id and ocurrido_en > now() - interval '3 days';
  select count(*) into v_actividad_previa from signal_iq.eventos
  where contacto_id = p_contacto_id
    and ocurrido_en between now() - interval '6 days' and now() - interval '3 days';

  if v_actividad_previa >= 3 and v_actividad_reciente::numeric / v_actividad_previa < 0.3 then
    v_caida := 50;
  end if;

  return least(100, v_rafaga_score + v_caida);
end;
$$ language plpgsql;

create or replace function signal_iq.calcular_capa2_proceso(p_contacto_id uuid)
returns numeric as $$
declare
  v_abandonos int;
begin
  select count(*) into v_abandonos from signal_iq.eventos
  where contacto_id = p_contacto_id
    and tipo_evento in ('landing_abandon','carrito_abandonado')
    and ocurrido_en > now() - interval '14 days';
  return least(100, v_abandonos * 35);
end;
$$ language plpgsql;

create or replace function signal_iq.calcular_capa3_voc(p_contacto_id uuid)
returns numeric as $$
declare
  v_score numeric;
begin
  select coalesce(
    sum(score_intensidad * power(0.5, extract(epoch from (now() - ocurrido_en)) / 86400.0 / 3))
    / nullif(sum(power(0.5, extract(epoch from (now() - ocurrido_en)) / 86400.0 / 3)), 0)
  , 0)
  into v_score
  from signal_iq.fragmentos_voc
  where contacto_id = p_contacto_id
    and tag_semantico in ('confusion','riesgo_legal','proceso_complejo')
    and ocurrido_en > now() - interval '30 days';
  return round(coalesce(v_score, 0), 2);
end;
$$ language plpgsql;

create or replace function signal_iq.recalcular_frustracion_contacto(p_contacto_id uuid)
returns void as $$
declare
  v_project_id uuid;
  v_config jsonb;
  v_capa1 numeric;
  v_capa2 numeric;
  v_capa3 numeric;
  v_index numeric;
  v_anterior numeric;
  v_umbral_warning numeric;
  v_umbral_critical numeric;
  v_frustration_id uuid;
  v_cruzo_umbral boolean;
begin
  select project_id into v_project_id from signal_iq.contactos where id = p_contacto_id;
  select config into v_config from signal_iq.projects where id = v_project_id;

  v_capa1 := signal_iq.calcular_capa1_canal(p_contacto_id);
  v_capa2 := signal_iq.calcular_capa2_proceso(p_contacto_id);
  v_capa3 := signal_iq.calcular_capa3_voc(p_contacto_id);

  v_index := round(
    v_capa1 * coalesce((v_config->'frustracion'->'pesos'->>'capa1')::numeric, 0.20) +
    v_capa2 * coalesce((v_config->'frustracion'->'pesos'->>'capa2')::numeric, 0.25) +
    v_capa3 * coalesce((v_config->'frustracion'->'pesos'->>'capa3')::numeric, 0.55)
  , 2);

  v_umbral_warning := coalesce((v_config->'frustracion'->>'umbral_warning')::numeric, 50);
  v_umbral_critical := coalesce((v_config->'frustracion'->>'umbral_critical')::numeric, 75);

  select current_frustration_index into v_anterior from signal_iq.contactos where id = p_contacto_id;
  v_cruzo_umbral := v_index >= v_umbral_warning and coalesce(v_anterior, 0) < v_umbral_warning;

  insert into signal_iq.frustration_scores
    (contacto_id, project_id, capa1_canal, capa2_proceso, capa3_voc, frustration_index, alert_triggered)
  values
    (p_contacto_id, v_project_id, v_capa1, v_capa2, v_capa3, v_index, v_cruzo_umbral)
  returning id into v_frustration_id;

  if v_cruzo_umbral then
    insert into signal_iq.alerts (project_id, contacto_id, frustration_score_id, severity)
    values (v_project_id, p_contacto_id, v_frustration_id,
      case when v_index >= v_umbral_critical then 'critical' else 'warning' end);
  end if;
end;
$$ language plpgsql;

-- ============================================
-- FUNCIÓN: motor de evaluación de touchpoints (docs/08-touchpoints-automatizacion.md)
-- ============================================
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

-- ============================================
-- TRIGGERS: cuándo se recalcula (score, frustración, touchpoints)
-- ============================================
create or replace function signal_iq.on_fragmento_voc_clasificado()
returns trigger as $$
begin
  if new.clasificado_en is not null and (tg_op = 'INSERT' or old.clasificado_en is null) then
    perform signal_iq.recalcular_score_contacto(new.contacto_id);
    perform signal_iq.recalcular_frustracion_contacto(new.contacto_id);
    perform signal_iq.evaluar_touchpoints_contacto(new.contacto_id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_fragmento_voc_clasificado
after insert or update on signal_iq.fragmentos_voc
for each row execute function signal_iq.on_fragmento_voc_clasificado();

create or replace function signal_iq.on_new_evento()
returns trigger as $$
begin
  if new.contacto_id is not null then
    perform signal_iq.recalcular_score_contacto(new.contacto_id);
    perform signal_iq.recalcular_frustracion_contacto(new.contacto_id);
    perform signal_iq.evaluar_touchpoints_contacto(new.contacto_id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_on_new_evento
after insert on signal_iq.eventos
for each row execute function signal_iq.on_new_evento();

-- touchpoints pendientes dejan de tener sentido si el deal ya se cerró
create or replace function signal_iq.on_deal_cerrado()
returns trigger as $$
begin
  if new.etapa_tipo in ('ganado','perdido') and old.etapa_tipo = 'abierta' then
    update signal_iq.touchpoint_triggers
    set status = 'skipped'
    where contacto_id = new.contacto_id and status = 'pending';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_on_deal_cerrado
after update on signal_iq.deals
for each row execute function signal_iq.on_deal_cerrado();

-- ============================================
-- JOB PROGRAMADO: recalcular frustración por caída de actividad (capa 1) +
-- descartar touchpoints pendientes que quedaron sin enviar demasiado tiempo.
-- Ningún trigger detecta la AUSENCIA de eventos nuevos -- hace falta un job
-- periódico. Requiere la extensión pg_cron habilitada (Database → Extensions
-- en el dashboard de Supabase). Ver docs/06-formulas-scoring-frustracion.md y
-- docs/08-touchpoints-automatizacion.md.
-- ============================================
-- select cron.schedule(
--   'signal-iq-mantenimiento-horario',
--   '0 * * * *', -- cada hora
--   $$
--     select signal_iq.recalcular_frustracion_contacto(id)
--     from signal_iq.contactos
--     where updated_at > now() - interval '30 days';
--
--     update signal_iq.touchpoint_triggers
--     set status = 'skipped'
--     where status = 'pending' and triggered_at < now() - interval '48 hours';
--   $$
-- );
