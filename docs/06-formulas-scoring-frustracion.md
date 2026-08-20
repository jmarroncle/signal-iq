# Fórmulas de Scoring y Frustración

Ambas fórmulas siguen el mismo patrón: **reglas fijas con pesos configurables por
proyecto** (no ML todavía, ver [`01-mvp-scope.md`](01-mvp-scope.md)), guardadas en
`projects.config`, con defaults razonables si un proyecto no los define. Los pesos
están afinados para el caso Tutellus (financiero/inversión) — cada proyecto nuevo
puede ajustarlos sin tocar código.

## Forma de `projects.config`

```json
{
  "scoring": {
    "pesos": { "demografico": 0.20, "comportamiento": 0.35, "voc": 0.35 },
    "umbral_hot": 70,
    "umbral_warm": 40,
    "umbral_capacidad_alta": 10000,
    "fuente_pesos": { "referido": 100, "webinar": 80, "organico": 60, "paid": 40 },
    "eventos_pesos": { "email_open": 2, "email_click": 5, "form_submit": 15, "webinar_registro": 10, "webinar_asistencia": 25, "landing_visita": 3, "checkout_iniciado": 20 }
  },
  "frustracion": {
    "pesos": { "capa1": 0.20, "capa2": 0.25, "capa3": 0.55 },
    "umbral_warning": 50,
    "umbral_critical": 75
  }
}
```

---

## Lead Score — 4 dimensiones

`demographic_score`, `behavior_score` y `voc_score` se calculan cada uno en una
escala 0-100 **independiente**. `total_score` los combina con pesos que suman 90
(no 100) a propósito, dejando 10 puntos de margen para el bonus de recurrencia —
así el total nunca necesita un tope artificial, sale así naturalmente:

```
total_score = demographic_score × 0.20
            + behavior_score    × 0.35
            + voc_score         × 0.35
            + recurrence_bonus  (0-10)
```

Clasificación: `total_score ≥ 70` → **HOT** · `≥ 40` → **WARM** · si no → **COLD**
(umbrales configurables por proyecto).

### 1. `demographic_score` — perfil (peso 20%)

```
demographic_score = fuente_score × 0.6 + capacidad_score × 0.4
```

- `fuente_score`: lookup de `fuente` del contacto contra `config.scoring.fuente_pesos`
  (ej: referido=100, webinar=80, orgánico=60, paid=40; default 50 si la fuente no
  está en la tabla).
- `capacidad_score`: si el esquema del negocio tiene un campo custom de capacidad
  financiera (ej: `monto_disponible_invertir`, típico en el template Fintech/
  Lanzamiento de producto), se normaliza contra `config.scoring.umbral_capacidad_alta`.
  Si el negocio no trackea eso (ej: SaaS), cae en **50 (neutral)** — la dimensión
  no debe penalizar a un negocio por no tener un campo que no le aplica.

### 2. `behavior_score` — comportamiento (peso 35%)

Suma de eventos recientes, con **decaimiento exponencial** (medio-vida de 7 días:
un evento de hace 7 días pesa la mitad que uno de hoy, uno de hace 14 pesa un
cuarto). Esto premia actividad reciente sobre actividad vieja sin necesidad de una
ventana fija arbitraria.

```
behavior_score = min(100, Σ peso(tipo_evento) × 0.5^(días_desde_evento / 7))
```

`peso(tipo_evento)` sale de `config.scoring.eventos_pesos` (ver ejemplo arriba —
un `webinar_asistencia` vale más que un `email_open`, configurable por negocio).

### 3. `voc_score` — lenguaje VOC (peso 35%)

A diferencia de behavior_score (que solo suma), acá cada fragmento tiene una
**dirección** (¿el tag indica más o menos intención de compra?) además de una
intensidad. Por eso se reutiliza `comb_gaps` — ya mapea `voc_tag` por proyecto —
sumándole una columna `polaridad_score` (-1 a 1):

| tag | polaridad_score | por qué |
|---|---|---|
| `intencion_compra` | +1.0 | señal directa de compra |
| `precio` | +0.3 | preguntar precio es engagement, no rechazo |
| `confusion` | -0.2 | no es rechazo, pero frena el avance |
| `proceso_complejo` | -0.3 | fricción operativa |
| `riesgo_legal` | -0.6 | objeción real, más cerca de frenar la decisión |

Cada fragmento aporta un score puntual `50 + polaridad × intensidad × 0.5` (50 =
neutral; con polaridad=1 e intensidad=100 llega a 100; con polaridad=-1 e
intensidad=100 baja a 0). El `voc_score` del contacto es el **promedio ponderado
por recencia** (mismo decaimiento de 7 días) de esos fragmentos de los últimos 60
días. Sin fragmentos recientes, cae a 50 (neutral, no penaliza silencio).

### 4. `recurrence_bonus` — bonus recurrencia (0-10, no ponderado)

```
recurrence_bonus = 0                                    si tipo = 'nuevo'
recurrence_bonus = min(10, 4 + previous_investments_count × 3)  si tipo = 'recurrente'
```

Ser recurrente ya suma 4 puntos de entrada; cada inversión previa suma 3 más,
tope en 10 (a partir de 2 inversiones previas).

---

## Frustration Index — 3 capas

```
frustration_index = capa1_canal × 0.20 + capa2_proceso × 0.25 + capa3_voc × 0.55
```

Capa 3 (lo que el contacto dice explícitamente) pesa más porque es la señal más
confiable — no es una inferencia de comportamiento, es lenguaje real. Coincide con
que en v1 es la única capa "completa" (ver `01-mvp-scope.md`).

### Capa 1 — frustración en canal (comportamiento de mensajería)

Dos señales, ambas calculables solo con `eventos` (sin instrumentación extra):

- **Ráfaga**: más de 3 eventos de `canal` mensajería (`whatsapp`/`email`) en la
  última hora → indicio de impaciencia. `+15` por cada evento arriba de 3, tope 50.
- **Caída**: actividad de los últimos 3 días cae más del 70% respecto a los 3
  días anteriores (y había actividad real antes, no ceros) → `+50`.

```
capa1_canal = min(100, rafaga_score + caida_score)
```

### Capa 2 — fricción en proceso (abandono de landing/formulario)

```
capa2_proceso = min(100, cantidad_abandonos_14d × 35)
```

Cuenta eventos `landing_abandon` / `carrito_abandonado` en los últimos 14 días.
Un abandono aislado no dice mucho; el segundo o tercero sí.

### Capa 3 — frustración expresada (VOC directo)

Promedio ponderado por recencia (medio-vida de **3 días**, más corta que la de
scoring — la frustración expresada es más urgente que el interés general) de la
`score_intensidad` de los fragmentos con tag `confusion`, `riesgo_legal` o
`proceso_complejo` en los últimos 30 días. Sin fragmentos así, capa3 = 0 (no hay
evidencia de frustración expresada, no se asume).

### Alertas — solo en el cruce del umbral

`alerts.severity`: **warning** si `frustration_index ≥ 50`, **critical** si
`≥ 75` (configurables). La alerta se dispara **solo cuando el índice cruza el
umbral desde abajo** (comparando contra el valor anterior del contacto) — no en
cada recálculo mientras se mantiene arriba. Sin esto, un contacto frustrado
generaría una alerta nueva cada vez que llega un evento, y el equipo dejaría de
prestarles atención.

---

## Funciones PL/pgSQL

```sql
-- ============================================
-- LEAD SCORE
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
    v_capacidad_score := 50; -- neutral si el negocio no trackea capacidad financiera
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
-- FRUSTRATION INDEX
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
```

## Cuándo se recalcula

```sql
create or replace function signal_iq.on_fragmento_voc_clasificado()
returns trigger as $$
begin
  if new.clasificado_en is not null and (tg_op = 'INSERT' or old.clasificado_en is null) then
    perform signal_iq.recalcular_score_contacto(new.contacto_id);
    perform signal_iq.recalcular_frustracion_contacto(new.contacto_id);
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
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_on_new_evento
after insert on signal_iq.eventos
for each row execute function signal_iq.on_new_evento();
```

### ⚠️ La "caída de actividad" (capa 1) necesita un job programado, no alcanza con triggers

Un trigger `after insert` solo se dispara cuando **llega** una fila nueva. La
señal de "caída de actividad" de la capa 1 depende de la **ausencia** de eventos
nuevos — y de eso ningún trigger se entera, porque no hay ninguna fila que
dispare nada. Sin esto, un contacto que estaba muy activo y de golpe desaparece
nunca actualiza su frustración, aunque sea exactamente el caso que esa señal
quiere capturar.

Hace falta un job programado (`pg_cron`, la extensión de Postgres para tareas
periódicas — disponible en Supabase) que recorra los contactos con actividad
reciente y fuerce el recálculo, aunque no haya llegado ningún evento nuevo:

```sql
-- correr una vez para programar el job (requiere la extensión pg_cron habilitada
-- en el proyecto de Supabase — Database → Extensions)
select cron.schedule(
  'recalcular-frustracion-inactivos',
  '0 * * * *', -- cada hora
  $$
    select signal_iq.recalcular_frustracion_contacto(id)
    from signal_iq.contactos
    where updated_at > now() - interval '30 days'
  $$
);
```

Si el plan de Supabase que se está usando no tiene `pg_cron` habilitado, la
alternativa es un cron externo (Vercel Cron, GitHub Actions) que llame a un
endpoint propio (`POST /jobs/recalcular-frustracion-inactivos`) con la misma
lógica.

## Ejemplo numérico (para verificar que la fórmula tiene sentido)

Contacto de Tutellus: llegó por `referido`, asistió a un webinar hace 2 días,
mandó un mensaje de WhatsApp hace 1 día con intención de compra clara
(intensidad 80) y hace 6 horas otro mensaje preguntando por el proceso legal
(intensidad 60, tag `riesgo_legal`). Es nuevo, sin inversiones previas.

- `demographic_score` = 100×0.6 + 50×0.4 = **80** (fuente referido=100, sin
  campo de capacidad financiera cargado → neutral 50)
- `behavior_score` ≈ 25×0.5^(2/7) ≈ **20.4** (solo el evento de
  `webinar_asistencia`, peso 25, con 2 días de decaimiento)
- `voc_score`: fragmento 1 (intención_compra, polaridad +1.0, intensidad 80,
  hace 1 día) → 50+1.0×80×0.5=90, peso decay 0.5^(1/7)≈0.905. Fragmento 2
  (riesgo_legal, polaridad -0.6, intensidad 60, hace 0.25 días) → 50-0.6×60×0.5=32,
  peso decay≈0.976. Promedio ponderado ≈ (90×0.905 + 32×0.976) / (0.905+0.976)
  ≈ **60.1**
- `recurrence_bonus` = **0** (tipo nuevo)
- `total_score` = 80×0.20 + 20.4×0.35 + 60.1×0.35 + 0 ≈ 16 + 7.1 + 21 ≈ **44.1**
  → **WARM**

Y frustración: `capa3_voc` con el fragmento de `riesgo_legal` (intensidad 60,
hace 6hs) ≈ **59** (decae poco, es reciente) — sin ráfaga ni caída ni abandonos,
`capa1`=0, `capa2`=0 → `frustration_index` = 59×0.55 ≈ **32.5**, por debajo del
umbral de warning (50): todavía no dispara alerta, pero es un WARM con una
objeción legal fresca — exactamente el tipo de caso que la ficha de contacto
debería mostrar con la acción recomendada del gap `riesgo_legal` visible.
