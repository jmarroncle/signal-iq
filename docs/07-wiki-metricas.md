# Wiki — sección informativa de métricas

## Por qué esto no es un menú aparte

Una wiki como ítem de menú separado no la lee casi nadie — se abre una vez y se
olvida. Lo que sí se usa es la **ayuda contextual**: un ícono "?" al lado del
número que la persona ya está mirando (`Score: 72 (HOT)`, `Frustración: 45`) que
linkea directo al artículo correspondiente. La wiki existe, pero el punto de
entrada real es la Ficha de Contacto, no un menú.

Contenido editable sin deploy — vive en una tabla, no en el código — porque lo va
a mantener quien gestione la cuenta del cliente, no necesariamente alguien
técnico.

## Tabla

```sql
create table signal_iq.wiki_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titulo text not null,
  categoria text, -- 'scoring' | 'frustracion' | 'general'
  contenido_md text not null,
  metricas_relacionadas text[], -- ej: ['current_score'] -- qué campos de la UI linkean acá
  orden int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## Endpoints

| Método | Endpoint | Qué hace |
|---|---|---|
| `GET` | `/wiki` | Lista artículos por categoría (para un índice, si hace falta) |
| `GET` | `/wiki/:slug` | Artículo puntual — es lo que abre el ícono "?" contextual |

v1 no expone `POST`/`PUT`: el contenido se edita directo en la tabla de Supabase.
Un editor in-app queda para más adelante si hace falta que alguien no técnico lo
mantenga sin tocar la base.

## Contenido — Lead Score

```sql
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
```

## Contenido — Índice de Frustración

```sql
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
```
