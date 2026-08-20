-- Signal IQ — datos de prueba
-- Correr DESPUÉS de schema.sql. Inserta un proyecto (Tutellus) y 3 contactos
-- con perfiles distintos. Los eventos y fragmentos VOC disparan los triggers
-- que ya calculan score, frustración y touchpoints automáticamente — no hace
-- falta llamar nada a mano, ver docs/06 y docs/08.
--
-- Contacto A (Sofía) — perfil HOT: webinar + intención de compra clara
-- Contacto B (Martín) — perfil WARM con objeción: webinar + duda legal reciente
-- Contacto C (Lucía) — recién llegada, sin actividad todavía (COLD por defecto)

insert into signal_iq.projects (id, name, slug) values
('11111111-1111-1111-1111-111111111111', 'Tutellus', 'tutellus');

insert into signal_iq.contactos (id, project_id, nombre, email, telefono, fuente, tipo) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Sofía Delgado', 'sofia@example.com', '+54 9 11 5555-0001', 'referido', 'nuevo'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Martín Ibarra', 'martin@example.com', '+54 9 11 5555-0002', 'webinar', 'nuevo'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Lucía Fernández', 'lucia@example.com', '+54 9 11 5555-0003', 'organico', 'nuevo');

-- Eventos (disparan recalcular_score_contacto + recalcular_frustracion_contacto + evaluar_touchpoints_contacto)
insert into signal_iq.eventos (project_id, contacto_id, canal, fuente_integracion, tipo_evento, ocurrido_en) values
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'webinar', 'ga4', 'webinar_asistencia', now() - interval '2 days'),
('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'webinar', 'ga4', 'webinar_asistencia', now() - interval '5 days'),
('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'web', 'typeform', 'form_submit', now() - interval '3 days'),
('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'web', 'ga4', 'landing_visita', now() - interval '1 hour');

-- Fragmentos VOC ya "clasificados" (clasificado_en seteado -- simula lo que
-- haría el worker de /voc/classify llamando a Claude Haiku)
insert into signal_iq.fragmentos_voc (project_id, contacto_id, canal, texto_original, tag_semantico, score_intensidad, ocurrido_en, clasificado_en) values
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'whatsapp',
 'Me encantó el webinar, quiero avanzar con la inversión esta semana', 'intencion_compra', 80,
 now() - interval '1 day', now() - interval '1 day'),
('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'whatsapp',
 '¿Esto está regulado por la CNV? no quiero tener problemas legales después', 'riesgo_legal', 60,
 now() - interval '6 hours', now() - interval '6 hours');

-- Verificación rápida (opcional, correr aparte después del insert de arriba)
-- select nombre, current_score, current_classification, current_frustration_index
-- from signal_iq.contactos order by current_score desc nulls last;
