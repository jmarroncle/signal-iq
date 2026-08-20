# La matemática detrás de Signal IQ

Este doc es distinto a los demás: no es referencia técnica para implementar
(eso ya está en `06` y `08`), es para **entender por qué el modelo está armado
así** — los conceptos matemáticos que se repiten en todo el producto, explicados
una sola vez cada uno, con la intuición y un ejemplo concreto. Sirve para
auditar el sistema ("¿por qué me dio este número?") y para explicárselo a
alguien que no lo construyó.

Hay un principio que atraviesa todo el documento: **cada número que ves en la
app sale de una fórmula que podés reconstruir a mano**. No hay una caja negra
de machine learning decidiendo por vos — eso es una decisión de diseño (ver
`01-mvp-scope.md`), no una limitación técnica. La ventaja es que cualquier
resultado se puede explicar y auditar; la contra es que el modelo no aprende
solo — hay que ajustarlo a mano si deja de reflejar la realidad.

## 1. Combinación lineal ponderada (weighted sum)

**La idea:** cuando algo depende de varios factores que no pesan lo mismo, se
multiplica cada uno por su importancia relativa y se suman. Es la misma lógica
que un promedio de notas donde el examen final vale más que la tarea.

**Dónde se usa:** el Lead Score entero es esto —

```
total_score = demografico × 0.20 + comportamiento × 0.35 + voc × 0.35 + bonus
```

y el Frustration Index también:

```
frustration_index = capa1 × 0.20 + capa2 × 0.25 + capa3 × 0.55
```

**Por qué así:** los pesos no son arbitrarios, codifican una apuesta de negocio.
Que VOC pese 0.35 y no 0.20 en el score dice "lo que el contacto dice importa
tanto como todo su comportamiento junto". Que la capa 3 pese 0.55 en frustración
dice "confío más en lo que la persona escribió que en lo que infiero de su
comportamiento". **Cambiar un peso es cambiar una hipótesis de negocio**, no
solo un número — por eso viven en `projects.config`, ajustables por proyecto sin
tocar código.

## 2. Normalizar todo a la misma escala antes de combinar

**La idea:** no podés sumar peras con manzanas. Antes de combinar demográfico +
comportamiento + VOC, cada uno se lleva primero a una escala común de 0 a 100 —
si no, el que tenga números más grandes domina la suma sin que eso refleje
importancia real.

**Dónde se usa:** cada una de las 4 dimensiones del score y las 3 capas de
frustración se calculan de forma independiente pero **todas terminan en 0-100**
antes de que la combinación lineal (concepto 1) las mezcle. `demographic_score`
sale de un promedio ponderado de sub-factores que ya están en 0-100;
`behavior_score` se acota con `min(100, ...)` explícitamente.

**Por qué así:** sin este paso, un `behavior_score` que pudiera crecer sin techo
(por ejemplo, sumando puntos por cada evento sin límite) terminaría dominando el
score total simplemente porque sus números son más grandes — no porque el
comportamiento realmente importe más que el resto.

## 3. Decaimiento exponencial y vida media (half-life)

**La idea:** algo que pasó hace 1 hora debería pesar más que algo que pasó hace
2 semanas, pero no querés un corte abrupto ("solo cuentan los últimos 7 días, el
día 8 desaparece de golpe"). El decaimiento exponencial hace que el peso baje
suavemente con el tiempo: se reduce a la mitad cada N días (la "vida media" o
half-life), sin cortes bruscos.

```
peso_efectivo = peso_original × 0.5^(días_transcurridos / vida_media)
```

**Dónde se usa:** `behavior_score` y `voc_score` con vida media de **7 días**;
`capa3_voc` (frustración) con vida media de **3 días** — más corta a propósito,
porque una frustración expresada pierde relevancia más rápido que un interés
general (si alguien se quejó hace 5 días y no volvió a pasar nada, probablemente
ya no está tan frustrado; pero si mostró interés en un webinar hace 5 días,
todavía puede seguir interesado).

**Ejemplo concreto:** un evento con peso 25 (asistir a un webinar), a distintas
antigüedades, con vida media de 7 días:

| Antigüedad | Peso efectivo |
|---|---|
| Hoy | 25.0 |
| 7 días | 12.5 |
| 14 días | 6.25 |
| 28 días | 1.56 |

Nunca llega exactamente a 0 (matemáticamente), pero después de 4-5 vidas medias
es prácticamente irrelevante — que es exactamente el comportamiento que querés:
lo viejo no desaparece de golpe, se desvanece.

## 4. Suma acumulada vs. promedio ponderado — dos preguntas distintas

**La idea:** sumar y promediar no son intercambiables, responden preguntas
distintas. Sumar responde "¿cuánta actividad hubo?" (más eventos = número más
alto, sin techo natural). Promediar responde "¿cuál es el estado actual?" (más
mensajes no mueve el número si todos dicen lo mismo).

**Dónde se usa:**
- `behavior_score` **suma** los eventos (con decaimiento) — más actividad
  reciente es, por definición, un mejor comportamiento. Tiene sentido que se
  acumule.
- `voc_score` y `capa3_voc` **promedian** los fragmentos (con el mismo
  decaimiento como ponderador) — no tiene sentido que alguien "sume" más
  intención de compra por escribir 5 mensajes distintos diciendo lo mismo. Lo
  que importa es la intensidad actual del sentimiento, no cuántas veces lo
  repitió.

**Por qué importa la distinción:** si `voc_score` sumara en vez de promediar, un
contacto muy conversador (aunque diga cosas neutras) terminaría con un score más
alto que uno callado con una sola frase de altísima intención de compra — eso
mediría locuacidad, no intención.

## 5. Separar dirección de magnitud (polaridad × intensidad)

**La idea:** una señal tiene dos componentes independientes: **hacia dónde
apunta** (¿acerca o aleja de la conversión?) y **qué tan fuerte es**. Mezclarlas
en un solo número pierde información — "muy en contra" y "muy a favor" no
deberían verse parecidos solo porque ambos son "intensos".

**Dónde se usa:** cada fragmento VOC aporta

```
valor = 50 + polaridad × intensidad × 0.5
```

`polaridad` (-1 a 1) sale de `comb_gaps.polaridad_score` según el tag
(`intencion_compra`=+1.0, `riesgo_legal`=-0.6, etc.) — es la dirección.
`score_intensidad` (0-100, viene de la clasificación de Claude) es la magnitud.
50 es el punto neutro: sin polaridad, no mueve nada; con polaridad positiva
fuerte e intensidad alta, se acerca a 100; con polaridad negativa fuerte e
intensidad alta, se acerca a 0.

**Por qué así:** permite que el mismo motor de intensidad (Claude clasificando
"qué tan fuerte es esto") sirva para tags de dirección completamente distinta,
sin tener que entrenar un modelo de sentimiento aparte — la dirección la define
una tabla de referencia editable (`comb_gaps`), no el modelo de lenguaje.

## 6. Disparo por cruce de umbral (edge-triggered), no por nivel

**La idea:** hay dos formas de reaccionar a que un valor supere un límite:
avisar **cada vez que lo mide y está arriba** (nivel), o avisar **solo la
primera vez que lo cruza** (borde/cruce). Un termostato inteligente no te manda
una notificación cada segundo mientras hace calor — te avisa una vez cuando
cruza el límite.

**Dónde se usa:** las alertas de frustración solo se crean si `frustration_index
≥ umbral` **y** el valor anterior estaba por debajo. Los touchpoints tienen
`cooldown_dias` con la misma lógica de fondo: no repetir mientras la condición
se sostiene.

**Por qué así:** sin esto, un contacto que se queda frustrado 3 días seguidos
generaría una alerta nueva en cada recálculo (cada evento, cada mensaje) — el
equipo terminaría ignorando las alertas por volumen, que es el problema
exactamente opuesto al que la función quiere resolver.

## 7. Ranking con desempate por grupo (top-N por partición)

**La idea:** cuando varias opciones compiten y solo puede "ganar" una por
categoría, se ordenan dentro de cada categoría y te quedás con la primera. Es
como elegir un representante por curso en vez de uno solo para todo el colegio.

**Dónde se usa:** el motor de touchpoints (`docs/08`) usa
`row_number() over (partition by channel order by priority desc)` — agrupa los
touchpoints que matchean por canal (email, whatsapp, sms) y dentro de cada
grupo se queda solo con el de mayor prioridad.

**Por qué así:** evita que un contacto reciba dos mensajes por el mismo canal a
la vez (verse descoordinado), pero sin bloquear que reciba mensajes por canales
distintos si ambos son relevantes — es un desempate *por categoría*, no un
ganador único global.

## 8. El problema del reloj congelado dentro de una transacción

**La idea (y un bug real que encontramos probando la app):** en Postgres,
`now()` devuelve el mismo valor durante toda una transacción, sin importar
cuántas operaciones ocurran adentro. Si varias filas de historial se insertan
en cascada dentro de la misma transacción (por ejemplo, un solo `insert` de
eventos dispara 3 recálculos seguidos), todas esas filas quedan con el
**mismo timestamp exacto** — y "traeme la más reciente ordenando por
timestamp" queda indefinido entre las que empataron.

**Dónde lo encontramos:** al cargar el seed de datos de prueba, la Ficha de
Martín mostraba un score viejo (28) mientras la lista de Contactos ya mostraba
el correcto (22) — la vista de detalle traía una fila de historial empatada en
timestamp con la real, y Postgres eligió la equivocada.

**La solución:** `clock_timestamp()` en vez de `now()` en las columnas de
historial (`contacto_scores.computed_at`, `frustration_scores.computed_at`,
`touchpoint_triggers.triggered_at`) — esa función sí avanza en cada llamada
dentro de la misma transacción, así que el orden temporal queda bien definido
siempre. Este no es un detalle menor: cualquier tabla de historial append-only
que dependa de "cuál es la fila más reciente" tiene este mismo riesgo si usa
`now()` en vez de `clock_timestamp()`.

## Resumen — qué concepto resuelve qué problema

| Concepto | Problema que resuelve |
|---|---|
| Combinación lineal ponderada | Combinar factores de distinta importancia en un solo número |
| Normalización a escala común | Que ningún factor domine solo por tener números más grandes |
| Decaimiento exponencial | Que lo reciente pese más sin cortes abruptos |
| Suma vs. promedio | Distinguir "cuánta actividad" de "cuál es el estado actual" |
| Polaridad × intensidad | Separar dirección de magnitud en una señal |
| Disparo por cruce de umbral | Evitar fatiga de alertas repetidas |
| Ranking por partición | Evitar mensajes duplicados por el mismo canal, sin bloquear otros canales |
| `clock_timestamp()` vs `now()` | Que el orden temporal del historial sea siempre correcto |
