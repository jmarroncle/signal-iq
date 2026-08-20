import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  obtenerContacto,
  historialScores,
  historialFrustracion,
  fragmentosVoc,
  combGaps,
} from '../lib/queries'
import type { Contacto, ContactoScore, FrustrationScore, FragmentoVoc, CombGap } from '../types'
import { ClasificacionBadge } from '../components/ClasificacionBadge'
import { Medidor } from '../components/Medidor'

export function FichaContactoPage() {
  const { id } = useParams<{ id: string }>()
  const [contacto, setContacto] = useState<Contacto | null>(null)
  const [scores, setScores] = useState<ContactoScore[]>([])
  const [frustracion, setFrustracion] = useState<FrustrationScore[]>([])
  const [voc, setVoc] = useState<FragmentoVoc[]>([])
  const [gaps, setGaps] = useState<CombGap[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      obtenerContacto(id),
      historialScores(id),
      historialFrustracion(id),
      fragmentosVoc(id),
      combGaps(),
    ])
      .then(([c, s, f, v, g]) => {
        setContacto(c)
        setScores(s)
        setFrustracion(f)
        setVoc(v)
        setGaps(g)
      })
      .catch((e) => setError(e.message))
  }, [id])

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!contacto) return <div className="p-8 text-slate-400">Cargando…</div>

  const ultimoScore = scores[0]
  const ultimaFrustracion = frustracion[0]
  const ultimoTagFrustrante = voc.find((f) =>
    ['confusion', 'riesgo_legal', 'proceso_complejo'].includes(f.tag_semantico ?? ''),
  )
  const gapActivo = ultimoTagFrustrante
    ? gaps.find((g) => g.voc_tag === ultimoTagFrustrante.tag_semantico)
    : voc[0]
      ? gaps.find((g) => g.voc_tag === voc[0].tag_semantico)
      : undefined

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={14} /> Volver a Contactos
      </Link>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{contacto.nombre ?? contacto.email}</h1>
          <p className="text-sm text-slate-400">
            {contacto.email} · {contacto.telefono ?? 'sin teléfono'} · fuente: {contacto.fuente ?? '—'} ·{' '}
            {contacto.tipo}
          </p>
        </div>
        <ClasificacionBadge clasificacion={contacto.current_classification} />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-slate-800 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Lead Score — {ultimoScore ? Math.round(ultimoScore.total_score) : '—'}
          </h2>
          {ultimoScore ? (
            <div className="space-y-3">
              <Medidor etiqueta="Perfil demográfico (20%)" valor={ultimoScore.demographic_score} />
              <Medidor etiqueta="Comportamiento (35%)" valor={ultimoScore.behavior_score} />
              <Medidor etiqueta="Lenguaje VOC (35%)" valor={ultimoScore.voc_score} />
              <Medidor etiqueta="Bonus recurrencia (+10)" valor={ultimoScore.recurrence_bonus} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Todavía no se calculó ningún score.</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Índice de Frustración — {ultimaFrustracion ? Math.round(ultimaFrustracion.frustration_index) : '—'}
          </h2>
          {ultimaFrustracion ? (
            <div className="space-y-3">
              <Medidor etiqueta="Capa 1 · Canal (20%)" valor={ultimaFrustracion.capa1_canal} invertido />
              <Medidor etiqueta="Capa 2 · Proceso (25%)" valor={ultimaFrustracion.capa2_proceso} invertido />
              <Medidor etiqueta="Capa 3 · VOC directo (55%)" valor={ultimaFrustracion.capa3_voc} invertido />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin señales de frustración registradas.</p>
          )}
        </section>
      </div>

      {gapActivo && (
        <section className="mb-8 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-400">
            Acción recomendada
          </h2>
          <p className="text-sm text-slate-300">
            Brecha detectada: <strong>{gapActivo.comb_dimension}</strong> ({gapActivo.gap_description})
          </p>
          <p className="mt-1 text-sm text-slate-400">{gapActivo.recommended_nudge}</p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Historial VOC ({voc.length})
        </h2>
        {voc.length === 0 ? (
          <p className="text-sm text-slate-500">Sin fragmentos VOC todavía.</p>
        ) : (
          <ul className="space-y-2">
            {voc.map((f) => (
              <li key={f.id} className="rounded-lg border border-slate-800 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-700 px-2 py-0.5">{f.tag_semantico ?? 'sin clasificar'}</span>
                  <span>{f.canal}</span>
                  <span>· intensidad {f.score_intensidad ?? '—'}</span>
                  <span>· {new Date(f.ocurrido_en).toLocaleString('es-AR')}</span>
                </div>
                <p className="text-slate-300">"{f.texto_original}"</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
