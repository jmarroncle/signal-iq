import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { obtenerResumenDashboard } from '../lib/queries'
import type { ResumenDashboard } from '../lib/queries'

function Metrica({ etiqueta, valor, nota }: { etiqueta: string; valor: string | number; nota?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
    </div>
  )
}

export function DashboardPage() {
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerResumenDashboard()
      .then(setResumen)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="p-8 text-slate-400">Cargando resumen…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!resumen) return null

  const total = resumen.total

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-xl font-semibold">Resumen</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metrica etiqueta="Contactos" valor={total} />
        <Metrica
          etiqueta="Frustración promedio"
          valor={resumen.frustracionPromedio !== null ? Math.round(resumen.frustracionPromedio) : '—'}
        />
        <Metrica
          etiqueta="En riesgo"
          valor={resumen.contactosEnRiesgo}
          nota="frustración ≥ 50"
        />
        <Metrica etiqueta="Sin score todavía" valor={resumen.sinScore} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Clasificación</h2>
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <div className="flex h-3">
            {total > 0 && (
              <>
                <div className="bg-red-500" style={{ width: `${(resumen.hot / total) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(resumen.warm / total) * 100}%` }} />
                <div className="bg-sky-500" style={{ width: `${(resumen.cold / total) * 100}%` }} />
                <div className="bg-slate-700" style={{ width: `${(resumen.sinScore / total) * 100}%` }} />
              </>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> HOT — {resumen.hot}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> WARM — {resumen.warm}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" /> COLD — {resumen.cold}</span>
          {resumen.sinScore > 0 && (
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-700" /> Sin score — {resumen.sinScore}</span>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Tags VOC más frecuentes</h2>
        {resumen.topTags.length === 0 ? (
          <p className="text-sm text-slate-500">Sin fragmentos VOC clasificados todavía.</p>
        ) : (
          <ul className="space-y-2">
            {resumen.topTags.map((t) => (
              <li key={t.tag} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-slate-300">{t.tag}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-violet-500"
                    style={{ width: `${(t.count / resumen.topTags[0].count) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{t.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <Link to="/contactos" className="text-sm text-slate-400 hover:text-slate-200 hover:underline">
          Ver todos los contactos →
        </Link>
      </div>
    </div>
  )
}
