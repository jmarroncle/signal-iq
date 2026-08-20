# Modo Chat — implementación con Claude API

## Modelo: Sonnet, no Haiku

`claude-sonnet-4-6`. Es el caso opuesto a la clasificación VOC: esto corre **una
vez por cuenta**, en el onboarding, y el resultado define la base de datos de todo
lo que esa cuenta va a hacer después. Bajo volumen + alto impacto → se prioriza
calidad de interpretación sobre costo.

## Por qué tool use y no pedirle un JSON en texto libre

Si le pedís a Claude "respondé en JSON" dentro del texto, tenés que parsear texto
libre y confiar en que no se rompa el formato. La API de Claude tiene **tool use**
(uso de herramientas): le definís una función con un schema de parámetros exacto
(qué campos existen, de qué tipo, cuáles son obligatorios) y Claude devuelve un
bloque `tool_use` con argumentos que ya vienen validados contra ese schema — no hay
que parsear ni adivinar.

Se define una única tool, `proponer_esquema`, y se fuerza su uso con
`tool_choice: {"type": "tool", "name": "proponer_esquema"}` — así la respuesta
**siempre** viene en este formato, nunca como texto suelto.

## Definición de la tool

```json
{
  "name": "proponer_esquema",
  "description": "Propone un esquema de datos para el panel de Signal IQ a partir de la descripción de un negocio, o pide una única aclaración si la descripción es demasiado ambigua para proponer algo con confianza.",
  "input_schema": {
    "type": "object",
    "properties": {
      "necesita_aclaracion": {
        "type": "boolean",
        "description": "true solo si la descripción es tan ambigua que cualquier esquema sería una adivinanza. Preferir proponer un esquema igual y marcarlo como ajustable antes que preguntar más de una vez."
      },
      "pregunta_aclaratoria": {
        "type": "string",
        "description": "Una sola pregunta puntual. Solo se usa si necesita_aclaracion es true."
      },
      "tipo_negocio_detectado": {
        "type": "string",
        "enum": ["lanzamiento_producto", "ecommerce", "saas", "fintech", "otro"]
      },
      "resumen": {
        "type": "string",
        "description": "1-2 frases en el idioma del usuario explicando qué esquema se propone y por qué"
      },
      "terminologia": {
        "type": "object",
        "properties": {
          "contacto": { "type": "string", "description": "Ej: 'Inversor', 'Cliente', 'Usuario' — cómo le dice este negocio a sus contactos" },
          "deal": { "type": "string", "description": "Ej: 'Inversión', 'Orden', 'Suscripción'" }
        }
      },
      "contacto_campos_custom": {
        "type": "array",
        "items": { "$ref": "#/$defs/campo_custom" }
      },
      "deal_etapas_pipeline": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "label": { "type": "string" },
            "tipo": { "type": "string", "enum": ["abierta", "ganado", "perdido"] }
          },
          "required": ["label", "tipo"]
        },
        "description": "Debe incluir al menos una etapa 'ganado' y una 'perdido' para que el sistema sepa cuándo dejar de actualizar la probabilidad del deal."
      },
      "deal_campos_custom": {
        "type": "array",
        "items": { "$ref": "#/$defs/campo_custom" }
      },
      "evento_canales_sugeridos": { "type": "array", "items": { "type": "string" } },
      "evento_tipos_sugeridos": { "type": "array", "items": { "type": "string" } },
      "voc_tags_custom": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Tags adicionales a los 5 base (confusion, precio, riesgo_legal, intencion_compra, proceso_complejo), solo si el negocio realmente lo necesita. Los 5 base nunca se quitan."
      }
    },
    "required": ["necesita_aclaracion", "tipo_negocio_detectado", "resumen", "contacto_campos_custom", "deal_etapas_pipeline"],
    "$defs": {
      "campo_custom": {
        "type": "object",
        "properties": {
          "clave": { "type": "string", "description": "snake_case, sin espacios ni acentos" },
          "etiqueta": { "type": "string" },
          "tipo": { "type": "string", "enum": ["texto", "numero", "fecha", "booleano", "seleccion"] },
          "opciones": { "type": "array", "items": { "type": "string" }, "description": "Solo si tipo es 'seleccion'" }
        },
        "required": ["clave", "etiqueta", "tipo"]
      }
    }
  }
}
```

## System prompt (instrucciones clave, no el texto completo)

- Rol: "sos un consultor de datos que traduce la descripción de un negocio en un
  esquema de CRM, para un equipo de marketing sin perfil técnico."
- Las 4 entidades (Contacto, Deal, Evento, Fragmento VOC) **son fijas y no se
  pueden agregar ni quitar** — el trabajo es proponer campos custom y
  terminología sobre esas 4, nunca inventar entidades nuevas.
- Los 5 tags VOC base son estructurales (alimentan el mapeo COM-B) y **nunca se
  quitan** — solo se pueden sumar tags custom si el negocio lo justifica.
- `deal_etapas_pipeline` siempre necesita al menos una etapa `ganado` y una
  `perdido` — sin esto el sistema no puede saber cuándo un deal dejó de estar
  abierto.
- Máximo **una** pregunta de aclaración por conversación. Si después de una
  aclaración la descripción sigue siendo vaga, proponer el esquema más
  razonable igual, marcado en `resumen` como punto de partida ajustable.
- Todo el texto visible para el usuario (`resumen`, `pregunta_aclaratoria`,
  `etiqueta` de los campos) va en el idioma en que escribió el usuario.

## Sesión y loop de regenerar

Cada conversación del Modo Chat vive en una fila de `esquema_chat_sessions`
(ver [`02-data-model.md`](02-data-model.md)). El array `mensajes` guarda el
historial completo — no solo la última vuelta — porque cada llamada a Claude
manda toda la conversación (así "regenerar con feedback" es, técnicamente, un
segundo turno de la misma conversación, no una llamada desde cero).

Pseudocódigo del endpoint `POST /onboarding/constructor/chat`:

```
recibir { project_id, mensaje }

sesion = buscar esquema_chat_sessions activa para project_id
         (o crear una nueva si no existe)

sesion.mensajes.push({ role: "user", content: mensaje })

respuesta = claude.messages.create({
  model: "claude-sonnet-4-6",
  system: SYSTEM_PROMPT,
  messages: sesion.mensajes,
  tools: [TOOL_PROPONER_ESQUEMA],
  tool_choice: { type: "tool", name: "proponer_esquema" }
})

tool_call = respuesta.content.find(block => block.type === "tool_use")
resultado = validar(tool_call.input, TOOL_PROPONER_ESQUEMA.input_schema)
// validar de nuevo del lado del servidor, nunca confiar ciegamente en el
// output del modelo — ver "Validación" abajo

sesion.mensajes.push({ role: "assistant", content: respuesta.content })
sesion.esquema_propuesto = resultado
guardar sesion

si resultado.necesita_aclaracion:
  devolver { tipo: "pregunta", texto: resultado.pregunta_aclaratoria }
sino:
  devolver { tipo: "esquema_propuesto", payload: resultado }
```

`POST /onboarding/constructor/confirmar` no vuelve a llamar a Claude — toma el
`esquema_propuesto` de la sesión (potencialmente ya editado a mano por el
usuario en la pantalla de preview) y lo escribe en `projects.esquema_config`.

## Validación

El `tool_use` de Claude ya viene con la forma correcta (tipos, campos
obligatorios) porque el `input_schema` se lo garantiza, pero igual hace falta
sanitizar antes de guardar:

- `clave` de cada campo custom: forzar a snake_case real (sacar espacios,
  acentos, caracteres no alfanuméricos) — Claude generalmente lo hace bien, pero
  no hay que confiar en eso para algo que después se usa como key de un
  `jsonb`.
- Chequear que `clave` no choque con nombres de columnas reales de `contactos`
  o `deals` (ej: que no proponga `email` como campo custom).
- Chequear que `deal_etapas_pipeline` tenga al menos una etapa `ganado` y una
  `perdido` — si Claude no la incluyó, agregar un fallback genérico ("Ganado" /
  "Perdido") en vez de fallar el onboarding completo.
