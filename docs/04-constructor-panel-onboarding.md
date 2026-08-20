# Constructor de Panel — flujo de onboarding pantalla a pantalla

Este es el camino de setup para usuarios **sin CRM**. El otro camino (conectar un
CRM externo) queda documentado como stub acá — el detalle completo es v2
(ver [`01-mvp-scope.md`](01-mvp-scope.md)).

## Pantalla 1 — ¿Ya usás un CRM?

**Qué ve:** dos opciones grandes, sin jerarquía visual entre ellas (ninguna es "la
recomendada" — el producto no empuja a nadie hacia un camino).

- "Sí, ya uso [HubSpot / Pipedrive / Salesforce / Zoho / otro]"
- "No, todavía no tengo uno"

**Qué hace el usuario:** elige una.

**Qué pasa después:**
- Si elige "Sí" → entra al flujo de conexión de CRM externo. **[v2 — stub por
  ahora]:** en v1 esta opción muestra "Esto lo estamos construyendo, mientras tanto
  arrancá con el panel nativo — vas a poder conectar tu CRM después desde
  Configuración → Integraciones sin perder nada de lo que armes acá."
- Si elige "No" → Pantalla 2.

**Caso borde:** el usuario no sabe qué es un CRM (posible si es un equipo de
marketing chico). El copy de la opción "No" incluye una aclaración breve: "No,
armamos todo esto en una planilla / no tenemos nada centralizado todavía."

## Pantalla 2 — Constructor de Panel: elegí modo

**Qué ve:** dos cards con el mismo peso visual.

- **Modo Chat** — "Contanos de tu negocio y armamos el panel juntos" (ícono de
  chat). Subtexto: "30 segundos, en tus palabras."
- **Modo Selector** — "Elegí el que más se parece a tu negocio" (ícono de grilla).
  Subtexto: "4 plantillas listas para usar."

**Qué hace el usuario:** elige un modo. No es una decisión final — puede volver
atrás y probar el otro modo antes de confirmar nada (nada se guarda hasta la
Pantalla 5).

## Pantalla 3A — Modo Chat: descripción del negocio

**Qué ve:** un textarea grande y vacío, con placeholder de ejemplo (no
precargado, para no sesgar la respuesta):

> "Ej: tengo una plataforma de inversión, mis leads son personas que asisten a
> webinars y después deciden si invierten."

Debajo, 2-3 chips de ejemplo clickeables (ecommerce, SaaS, lanzamiento de
producto) que autocompletan el textarea con un ejemplo — sirven para mostrar el
nivel de detalle esperado, no como atajo real.

Botón "Generar mi panel" (deshabilitado hasta que haya texto).

**Qué hace el usuario:** escribe una descripción libre de su negocio y sus leads,
en el idioma que quiera. Envía.

**Qué pasa después:** Pantalla 3A-loading.

## Pantalla 3A-loading — Analizando

**Qué ve:** estado de carga con microcopy que va cambiando cada ~2 segundos
("Leyendo tu descripción...", "Identificando qué datos importan...",
"Armando el esquema...") — la llamada a Claude tarda unos segundos, este texto
evita que se sienta colgado.

**Qué pasa después:** según la respuesta de Claude (ver
[`05-modo-chat-claude.md`](05-modo-chat-claude.md)), va a Pantalla 3A-aclaracion
o a Pantalla 3A-preview.

## Pantalla 3A-aclaracion — Claude pide una precisión (caso borde)

Se dispara solo cuando la descripción es demasiado ambigua para proponer un
esquema con confianza (ej: el usuario escribió "vendo cosas online" sin más
detalle).

**Qué ve:** una sola pregunta puntual de Claude, en el mismo tono conversacional
("¿Tus clientes compran una vez o vuelven a comprar seguido? Eso cambia bastante
qué campos te conviene trackear.") + el textarea para responder.

**Diseño deliberado:** nunca más de una pregunta de aclaración por vuelta —
si la respuesta sigue siendo ambigua, Claude debe arriesgar una propuesta igual
(marcándola como "primera versión, ajustable") en vez de seguir preguntando.
Ver la restricción en el system prompt en `05-modo-chat-claude.md`.

**Qué pasa después:** vuelve a 3A-loading con la respuesta agregada al historial.

## Pantalla 3A-preview / 3B-preview — Esquema propuesto (componente compartido)

Esta pantalla es el mismo componente para Modo Chat (después de generar) y Modo
Selector (después de elegir una card) — la única diferencia es de dónde vino el
`esquema_config`.

**Qué ve:**
- Un resumen de 1-2 líneas en lenguaje natural de lo que se detectó/eligió
  ("Detectamos un negocio de lanzamiento de producto con inversión — armamos
  Contacto, Deal (con etapas de webinar hasta inversión), Evento y VOC con eso
  en mente.")
- Card **Contacto**: lista de campos custom propuestos, cada uno editable
  inline (nombre del campo, tipo: texto/número/fecha/booleano/selección) y
  borrable. Botón "+ agregar campo".
- Card **Deal**: las etapas del pipeline como chips reordenables por
  drag-and-drop, cada una con su tipo (abierta/ganado/perdido) marcado con
  color. Debajo, los campos custom del deal (misma UI que Contacto).
- Card **Evento**: canales y tipos de evento sugeridos, como chips editables.
- Card **VOC**: los 5 tags base (confusión, precio, riesgo legal, intención de
  compra, proceso complejo) siempre presentes y no editables (son estructurales
  para el scoring/COM-B) + tags custom opcionales que el usuario puede agregar.

**Qué hace el usuario:** puede editar cualquier campo inline, y tiene tres
acciones al pie:
- **"Usar este esquema"** → Pantalla 5 (confirmación)
- **"Pedile a Claude que lo ajuste"** (solo en Modo Chat) → abre un input corto
  de feedback ("¿qué le falta o le sobra?") → vuelve a 3A-loading con el
  feedback agregado a la conversación
- **"Volver a elegir"** → Pantalla 2

## Pantalla 3B — Modo Selector: 4 plantillas

**Qué ve:** 4 cards con el mismo peso visual, cada una con ícono, nombre y 3-4
campos clave como preview rápido (sin abrir nada):

| Plantilla | Preview rápido |
|---|---|
| **Lanzamiento de producto** | Webinars, inversiones, etapas de interés → cierre |
| **Ecommerce** | Órdenes, AOV, carritos abandonados |
| **SaaS** | Trials, MRR, churn |
| **Fintech** | Instrumentos, APY, perfil de riesgo |

**Qué hace el usuario:** hace click en una card.

**Qué pasa después:** Pantalla 3A-preview/3B-preview (componente compartido),
precargada con el `esquema_config` de esa plantilla — ver los 4 seeds en
[`02-data-model.md`](02-data-model.md) y `supabase/schema.sql`.

## Pantalla 5 — Confirmación

**Qué ve:** "Tu panel está listo" + resumen final del esquema aplicado (mismo
formato que el preview, ahora en modo solo-lectura) + botón "Ir al panel".

**Qué hace el sistema al confirmar (antes de esta pantalla):**
`POST /onboarding/constructor/confirmar` escribe `esquema_config` en
`projects`, marca `esquema_chat_sessions.estado = 'confirmado'` si vino del
Modo Chat.

**Qué pasa después:** entra al dashboard vacío del CRM nativo, con un banner
para conectar la primera fuente de datos (Segment) — eso ya no es parte del
Constructor de Panel, es el siguiente paso del onboarding general.

## Resumen del flujo

```
Pantalla 1: ¿Tenés CRM?
  ├─ Sí → [v2] conexión CRM externo
  └─ No → Pantalla 2: elegí modo
       ├─ Modo Chat → 3A: descripción libre → 3A-loading → (3A-aclaracion)? → preview
       └─ Modo Selector → 3B: 4 cards → preview
                                            │
                                            ├─ "Usar este esquema" → Pantalla 5 → dashboard
                                            ├─ "Ajustar con Claude" (solo Chat) → loop
                                            └─ "Volver a elegir" → Pantalla 2
```
