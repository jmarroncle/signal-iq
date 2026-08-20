export type Clasificacion = 'HOT' | 'WARM' | 'COLD'
export type TipoContacto = 'nuevo' | 'recurrente'

export interface Contacto {
  id: string
  project_id: string
  nombre: string | null
  email: string | null
  telefono: string | null
  fuente: string | null
  fecha_entrada: string
  tipo: TipoContacto
  previous_investments_count: number
  previous_investments_total: number
  current_score: number | null
  current_classification: Clasificacion | null
  current_frustration_index: number | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ContactoScore {
  id: string
  contacto_id: string
  demographic_score: number | null
  behavior_score: number | null
  voc_score: number | null
  recurrence_bonus: number | null
  total_score: number
  classification: Clasificacion
  computed_at: string
}

export interface FrustrationScore {
  id: string
  contacto_id: string
  capa1_canal: number | null
  capa2_proceso: number | null
  capa3_voc: number | null
  frustration_index: number
  alert_triggered: boolean
  computed_at: string
}

export interface FragmentoVoc {
  id: string
  project_id: string
  contacto_id: string
  canal: string | null
  texto_original: string
  tag_semantico: string | null
  score_intensidad: number | null
  ocurrido_en: string
  clasificado_en: string | null
}

export interface CombGap {
  id: string
  project_id: string | null
  voc_tag: string
  comb_dimension: 'capability' | 'opportunity' | 'motivation'
  gap_description: string | null
  recommended_nudge: string | null
  recommended_touchpoint_type: string | null
  priority: number
  polaridad_score: number | null
}

export type EtapaTipo = 'abierta' | 'ganado' | 'perdido'

export interface EtapaPipeline {
  label: string
  tipo: EtapaTipo
}

export interface Pipeline {
  id: string
  project_id: string
  nombre: string
  tipo: 'loyalty' | 'ventas' | 'custom'
  es_principal: boolean
  etapas: EtapaPipeline[]
  orden: number
}

export interface Deal {
  id: string
  contacto_id: string
  project_id: string
  pipeline_id: string
  etapa: string
  etapa_tipo: EtapaTipo
  valor: number | null
  probabilidad: number | null
  fecha_cierre_estimada: string | null
}

/** Deal con los datos del contacto ya resueltos, para pintar la tarjeta del kanban sin otro round-trip. */
export interface DealConContacto extends Deal {
  contacto: Pick<Contacto, 'id' | 'nombre' | 'email' | 'current_score' | 'current_classification' | 'current_frustration_index'>
}

export type OrigenActividad = 'evento' | 'voc' | 'deal'

export interface ActividadItem {
  id: string
  project_id: string
  contacto_id: string
  ocurrido_en: string
  origen: OrigenActividad
  tipo: string | null
  canal: string | null
  detalle: string | null
}

export interface WikiArticle {
  id: string
  slug: string
  titulo: string
  categoria: string | null
  contenido_md: string
  metricas_relacionadas: string[] | null
}
