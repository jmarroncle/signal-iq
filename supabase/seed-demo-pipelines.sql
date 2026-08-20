-- Signal IQ — pipelines de ejemplo para Tutellus
-- Correr DESPUÉS de la migración de pipelines (docs/08) y del seed-demo.sql
-- original. Crea el pipeline de Loyalty (principal) y el de Ventas, con deals
-- de ejemplo para los contactos ya sembrados + un contacto nuevo (Elena) para
-- mostrar el caso de loyalty en riesgo.

insert into signal_iq.pipelines (id, project_id, nombre, tipo, es_principal, etapas, orden) values
(
  'eeeeeeee-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Loyalty', 'loyalty', true,
  '[
    {"label": "Cliente activo", "tipo": "abierta"},
    {"label": "En riesgo de churn", "tipo": "abierta"},
    {"label": "Reactivado", "tipo": "abierta"},
    {"label": "Embajador", "tipo": "ganado"},
    {"label": "Perdido / Churn", "tipo": "perdido"}
  ]'::jsonb,
  1
),
(
  'eeeeeeee-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Ventas', 'ventas', false,
  '[
    {"label": "Webinar asistido", "tipo": "abierta"},
    {"label": "Interesado", "tipo": "abierta"},
    {"label": "Propuesta enviada", "tipo": "abierta"},
    {"label": "Invertido", "tipo": "ganado"},
    {"label": "Perdido", "tipo": "perdido"}
  ]'::jsonb,
  2
);

-- Contacto nuevo: Elena, ya es cliente (recurrente) -- para mostrar loyalty
insert into signal_iq.contactos (id, project_id, nombre, email, telefono, fuente, tipo, previous_investments_count, previous_investments_total) values
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Elena Roca', 'elena@example.com', '+54 9 11 5555-0004', 'referido', 'recurrente', 2, 15000);

insert into signal_iq.eventos (project_id, contacto_id, canal, fuente_integracion, tipo_evento, ocurrido_en) values
('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'email', 'klaviyo', 'email_open', now() - interval '25 days');

-- Deals: Sofía y Martín en Ventas, Elena en Loyalty (en riesgo de churn --
-- dispara el touchpoint de push si se cargó el de docs/08)
insert into signal_iq.deals (contacto_id, project_id, pipeline_id, etapa, etapa_tipo, valor) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-2222-2222-2222-222222222222', 'Propuesta enviada', 'abierta', 5000),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-2222-2222-2222-222222222222', 'Interesado', 'abierta', 3000),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-1111-1111-1111-111111111111', 'En riesgo de churn', 'abierta', 15000);
