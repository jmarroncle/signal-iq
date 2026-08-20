import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listarPipelines, dealsDePipeline, moverDealAEtapa } from '../lib/queries'
import type { Pipeline, DealConContacto } from '../types'
import { ClasificacionBadge } from '../components/ClasificacionBadge'

const colorEtapaTipo: Record<string, string> = {
  abierta: 'border-slate-800',
  ganado: 'border-emerald-500/40',
  perdido: 'border-red-500/40',
}

export function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [deals, setDeals] = useState<DealConContacto[]>([])
  const [cargandoPipelines, setCargandoPipelines] = useState(true)
  const [cargandoDeals, setCargandoDeals] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarPipelines()
      .then((ps) => {
        setPipelines(ps)
        const principal = ps.find((p) => p.es_principal) ?? ps[0]
        setPipelineId(principal?.id ?? null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargandoPipelines(false))
  }, [])

  const cargarDeals = useCallback(() => {
    if (!pipelineId) return
    setCargandoDeals(true)
    dealsDePipeline(pipelineId)
      .then(setDeals)
      .catch((e) => setError(e.message))
      .finally(() => setCargandoDeals(false))
  }, [pipelineId])

  useEffect(() => {
    cargarDeals()
  }, [cargarDeals])

  const pipeline = pipelines.find((p) => p.id === pipelineId)

  async function moverA(dealId: string, etapa: string, etapaTipo: DealConContacto['etapa_tipo']) {
    await moverDealAEtapa(dealId, etapa, etapaTipo)
    cargarDeals()
  }

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        {pipelines.length > 0 && (
          <div className="flex gap-1 rounded-lg border border-slate-800 p-1">
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => setPipelineId(p.id)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  p.id === pipelineId ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.nombre}
                {p.es_principal && <span className="ml-1.5 text-xs text-slate-500">· principal</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {cargandoPipelines && <p className="text-slate-400">Cargando…</p>}

      {!cargandoPipelines && cargandoDeals && <p className="text-slate-400">Cargando contactos del pipeline…</p>}

      {!cargandoPipelines && !cargandoDeals && pipeline && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipeline.etapas.map((etapa) => {
            const dealsEnEtapa = deals.filter((d) => d.etapa === etapa.label)
            return (
              <div key={etapa.label} className="w-72 flex-shrink-0">
                <div className={`mb-3 flex items-center justify-between border-b-2 pb-2 ${colorEtapaTipo[etapa.tipo]}`}>
                  <h2 className="text-sm font-semibold text-slate-200">{etapa.label}</h2>
                  <span className="text-xs text-slate-500">{dealsEnEtapa.length}</span>
                </div>
                <div className="space-y-2">
                  {dealsEnEtapa.map((deal) => (
                    <div key={deal.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <Link to={`/contactos/${deal.contacto.id}`} className="text-sm font-medium hover:underline">
                          {deal.contacto.nombre ?? deal.contacto.email}
                        </Link>
                        <ClasificacionBadge clasificacion={deal.contacto.current_classification} />
                      </div>
                      <div className="mb-2 flex items-center gap-3 text-xs text-slate-500">
                        {deal.valor !== null && <span>${deal.valor.toLocaleString('es-AR')}</span>}
                        {deal.probabilidad !== null && <span>{Math.round(deal.probabilidad)}% prob.</span>}
                        {deal.contacto.current_frustration_index !== null && deal.contacto.current_frustration_index > 0 && (
                          <span className="text-amber-400">frustración {Math.round(deal.contacto.current_frustration_index)}</span>
                        )}
                      </div>
                      <select
                        value={deal.etapa}
                        onChange={(e) => {
                          const nueva = pipeline.etapas.find((et) => et.label === e.target.value)
                          if (nueva) moverA(deal.id, nueva.label, nueva.tipo)
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
                      >
                        {pipeline.etapas.map((et) => (
                          <option key={et.label} value={et.label}>
                            Mover a: {et.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {dealsEnEtapa.length === 0 && (
                    <p className="text-xs text-slate-600">Sin contactos en esta etapa.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!cargandoPipelines && pipelines.length === 0 && (
        <p className="text-slate-400">
          Todavía no hay pipelines configurados. Corré{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm">supabase/seed-demo-pipelines.sql</code> para
          ver esta vista con datos reales.
        </p>
      )}
    </div>
  )
}
