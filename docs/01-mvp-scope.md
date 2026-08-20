# MVP scope — v1.0 vs v2

**Criterio de corte:** en v1 entra todo lo que arma el loop único del producto
(VOC → Score → COM-B → Acción recomendada). Queda afuera todo lo analítico/predictivo
que necesita historial para ser confiable, y todo lo que sea construir un motor de
automatización completo cuando herramientas ya existentes (Klaviyo, Wati) lo resuelven
mejor por ahora.

Con Tutellus como primer caso real, el día 1 no hay suficiente historial para que
cohortes, benchmarks o un predictor de churn digan algo confiable — construirlos ahora
sería optimizar sobre ruido. Lo que sí se puede probar desde el día 1 es si el loop
VOC → Score → COM-B → Acción mejora conversión, que es la apuesta central del producto.

| Módulo | v1.0 (MVP) | v2 |
|---|---|---|
| **Clientes** | Tabla básica: nuevo/recurrente, conteo y monto de inversiones previas. LTV como cálculo simple (query, no dashboard dedicado) | LTV por segmento con cohortes, dashboard dedicado |
| **Lead Scoring** | Score de 4 dimensiones con fórmula ponderada fija (reglas, no ML) → HOT/WARM/COLD | Ajuste de pesos por ML / auto-tuning según conversión real |
| **VOC Explorer** | Captura + clasificación con Claude API (Haiku) + tags semánticos | — (completo en v1) |
| **COM-B Gaps** | Tabla de mapeo estática tag→brecha→nudge (configurable, no aprendida) | Mapeo que se ajusta solo según qué nudge convirtió más |
| **Frustraciones** | Capa 3 (VOC directo) completa. Capas 1 y 2 en versión simplificada (lo que ya viene de Segment/GA4 sin instrumentación extra). Alerta en tiempo real vía threshold simple | Capas 1 y 2 completas con eventos de Segment enriquecidos, tuning fino del índice 0-100 |
| **Touchpoints y Automatización** | Tabla de triggers (reglas fijas: score+frustración → touchpoint sugerido). El envío real lo dispara Klaviyo/Wati escuchando un webhook de Supabase — **no** se construye un flow builder propio | Flow builder visual configurable por segmento dentro de la app |
| **Acción recomendada por lead** | Lookup directo desde COM-B gap activo → touchpoint sugerido | — (completo en v1) |
| Cohort analysis por frustración de entrada | ❌ | ✅ (necesita volumen histórico) |
| Mapa de fricción comparativo entre proyectos | ❌ | ✅ (necesita ≥2 proyectos con datos) |
| Predictor de churn pre-conversión | ❌ | ✅ (necesita dataset de entrenamiento) |
| Loop VOC → copy | ❌ | ✅ (necesita volumen de frases repetidas) |

## Decisiones tomadas

- **Modelo de clasificación VOC:** `claude-haiku-4-5-20251001`. Es un job de alto
  volumen (cada reply de email/WhatsApp/formulario pasa por acá), no conversacional
  — se prioriza costo sobre precisión marginal.
- **Infraestructura Supabase:** se reutiliza el proyecto "Behavioral platform"
  (límite de 2 proyectos gratuitos ya alcanzado). Signal IQ vive en un **schema
  propio** (`signal_iq`) dentro de esa misma base de datos, separado del schema
  `public` que ya usa la vApp de Behavioral Design — así no hay colisión de nombres
  de tabla (la vApp ya tiene `public.projects`, por ejemplo).
