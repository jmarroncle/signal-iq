import { supabase } from './supabase'
import type {
  Contacto,
  ContactoScore,
  FrustrationScore,
  FragmentoVoc,
  FragmentoVocConContacto,
  CombGap,
  Deal,
  Pipeline,
  DealConContacto,
  ActividadItem,
  WikiArticle,
  Touchpoint,
  TouchpointTriggerConTouchpoint,
} from '../types'

export async function listarContactos(): Promise<Contacto[]> {
  const { data, error } = await supabase
    .from('contactos')
    .select('*')
    .order('current_score', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data as Contacto[]
}

export async function obtenerContacto(id: string): Promise<Contacto> {
  const { data, error } = await supabase.from('contactos').select('*').eq('id', id).single()
  if (error) throw error
  return data as Contacto
}

export async function historialScores(contactoId: string): Promise<ContactoScore[]> {
  const { data, error } = await supabase
    .from('contacto_scores')
    .select('*')
    .eq('contacto_id', contactoId)
    .order('computed_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return data as ContactoScore[]
}

export async function historialFrustracion(contactoId: string): Promise<FrustrationScore[]> {
  const { data, error } = await supabase
    .from('frustration_scores')
    .select('*')
    .eq('contacto_id', contactoId)
    .order('computed_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return data as FrustrationScore[]
}

export async function fragmentosVoc(contactoId: string): Promise<FragmentoVoc[]> {
  const { data, error } = await supabase
    .from('fragmentos_voc')
    .select('*')
    .eq('contacto_id', contactoId)
    .order('ocurrido_en', { ascending: false })
  if (error) throw error
  return data as FragmentoVoc[]
}

export async function combGaps(): Promise<CombGap[]> {
  const { data, error } = await supabase.from('comb_gaps').select('*')
  if (error) throw error
  return data as CombGap[]
}

export async function dealsDeContacto(contactoId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('contacto_id', contactoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Deal[]
}

export async function listarPipelines(): Promise<Pipeline[]> {
  const { data, error } = await supabase.from('pipelines').select('*').order('orden')
  if (error) throw error
  return data as Pipeline[]
}

export async function dealsDePipeline(pipelineId: string): Promise<DealConContacto[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*, contacto:contactos(id, nombre, email, current_score, current_classification, current_frustration_index)')
    .eq('pipeline_id', pipelineId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data as unknown as DealConContacto[]
}

export async function moverDealAEtapa(dealId: string, etapa: string, etapaTipo: Deal['etapa_tipo']): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ etapa, etapa_tipo: etapaTipo, updated_at: new Date().toISOString() })
    .eq('id', dealId)
  if (error) throw error
}

/**
 * actividad_global es una vista (UNION ALL de eventos/fragmentos_voc/deals) sin
 * relaciones declaradas, así que PostgREST no puede "embeder" el nombre del
 * contacto en la misma consulta — se trae aparte y se une en el cliente.
 */
export async function listarActividadGlobal(limit = 60): Promise<{ items: ActividadItem[]; nombres: Record<string, string> }> {
  const { data, error } = await supabase
    .from('actividad_global')
    .select('*')
    .order('ocurrido_en', { ascending: false })
    .limit(limit)
  if (error) throw error
  const items = data as ActividadItem[]

  const contactoIds = [...new Set(items.map((i) => i.contacto_id))]
  const nombres: Record<string, string> = {}
  if (contactoIds.length > 0) {
    const { data: contactos, error: errorContactos } = await supabase
      .from('contactos')
      .select('id, nombre, email')
      .in('id', contactoIds)
    if (errorContactos) throw errorContactos
    for (const c of contactos as Pick<Contacto, 'id' | 'nombre' | 'email'>[]) {
      nombres[c.id] = c.nombre ?? c.email ?? 'Sin nombre'
    }
  }

  return { items, nombres }
}

export interface ResumenDashboard {
  total: number
  hot: number
  warm: number
  cold: number
  sinScore: number
  frustracionPromedio: number | null
  contactosEnRiesgo: number // frustration_index >= 50
  topTags: { tag: string; count: number }[]
}

export async function obtenerResumenDashboard(): Promise<ResumenDashboard> {
  const [{ data: contactos, error: errorContactos }, { data: fragmentos, error: errorFragmentos }] = await Promise.all([
    supabase.from('contactos').select('current_classification, current_frustration_index'),
    supabase.from('fragmentos_voc').select('tag_semantico'),
  ])
  if (errorContactos) throw errorContactos
  if (errorFragmentos) throw errorFragmentos

  const filas = contactos as Pick<Contacto, 'current_classification' | 'current_frustration_index'>[]
  const total = filas.length
  const hot = filas.filter((c) => c.current_classification === 'HOT').length
  const warm = filas.filter((c) => c.current_classification === 'WARM').length
  const cold = filas.filter((c) => c.current_classification === 'COLD').length
  const sinScore = total - hot - warm - cold
  const conFrustracion = filas.filter((c) => c.current_frustration_index !== null)
  const frustracionPromedio =
    conFrustracion.length > 0
      ? conFrustracion.reduce((acc, c) => acc + (c.current_frustration_index ?? 0), 0) / conFrustracion.length
      : null
  const contactosEnRiesgo = filas.filter((c) => (c.current_frustration_index ?? 0) >= 50).length

  const conteoTags = new Map<string, number>()
  for (const f of fragmentos as { tag_semantico: string | null }[]) {
    if (!f.tag_semantico) continue
    conteoTags.set(f.tag_semantico, (conteoTags.get(f.tag_semantico) ?? 0) + 1)
  }
  const topTags = [...conteoTags.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return { total, hot, warm, cold, sinScore, frustracionPromedio, contactosEnRiesgo, topTags }
}

export async function obtenerArticuloWiki(slug: string): Promise<WikiArticle> {
  const { data, error } = await supabase.from('wiki_articles').select('*').eq('slug', slug).single()
  if (error) throw error
  return data as WikiArticle
}

/** App single-tenant por ahora (solo Tutellus) — trae el único proyecto que existe. */
export async function obtenerProyectoId(): Promise<string> {
  const { data, error } = await supabase.from('projects').select('id').limit(1).single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function listarTouchpoints(): Promise<Touchpoint[]> {
  const { data, error } = await supabase.from('touchpoints').select('*').order('priority', { ascending: false })
  if (error) throw error
  return data as Touchpoint[]
}

export async function crearTouchpoint(touchpoint: Omit<Touchpoint, 'id'> & { id?: string }): Promise<void> {
  const { error } = await supabase.from('touchpoints').insert(touchpoint)
  if (error) throw error
}

export async function actualizarTouchpoint(id: string, cambios: Partial<Omit<Touchpoint, 'id'>>): Promise<void> {
  const { error } = await supabase.from('touchpoints').update(cambios).eq('id', id)
  if (error) throw error
}

export async function eliminarTouchpoint(id: string): Promise<void> {
  const { error } = await supabase.from('touchpoints').delete().eq('id', id)
  if (error) throw error
}

export async function triggersDeContacto(contactoId: string): Promise<TouchpointTriggerConTouchpoint[]> {
  const { data, error } = await supabase
    .from('touchpoint_triggers')
    .select('*, touchpoint:touchpoints(id, name, channel)')
    .eq('contacto_id', contactoId)
    .order('triggered_at', { ascending: false })
  if (error) throw error
  return data as unknown as TouchpointTriggerConTouchpoint[]
}

export async function omitirTrigger(id: string): Promise<void> {
  const { error } = await supabase.from('touchpoint_triggers').update({ status: 'skipped' }).eq('id', id)
  if (error) throw error
}

export async function fragmentosVocGlobal(): Promise<FragmentoVocConContacto[]> {
  const { data, error } = await supabase
    .from('fragmentos_voc')
    .select('*, contacto:contactos(id, nombre, email)')
    .order('ocurrido_en', { ascending: false })
  if (error) throw error
  return data as unknown as FragmentoVocConContacto[]
}

export interface NuevoFragmentoVoc {
  project_id: string
  contacto_id: string
  canal: string | null
  texto_original: string
  tag_semantico: string | null
  score_intensidad: number | null
}

/**
 * En producción esto lo llena un webhook (WhatsApp/email/formulario) que clasifica
 * con Claude Haiku. Acá se carga a mano para probar el loop VOC → Score →
 * Frustración sin esa integración todavía (docs/01-mvp-scope.md).
 */
export async function crearFragmentoVoc(payload: NuevoFragmentoVoc): Promise<void> {
  const { error } = await supabase.from('fragmentos_voc').insert({
    ...payload,
    ocurrido_en: new Date().toISOString(),
    clasificado_en: payload.tag_semantico ? new Date().toISOString() : null,
  })
  if (error) throw error
}
