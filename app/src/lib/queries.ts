import { supabase } from './supabase'
import type { Contacto, ContactoScore, FrustrationScore, FragmentoVoc, CombGap, Deal } from '../types'

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
