import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarContactos } from '../lib/queries'
import type { Contacto } from '../types'
import { ClasificacionBadge } from '../components/ClasificacionBadge'

export function ContactosPage() {
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarContactos()
      .then(setContactos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="p-8 text-slate-400">Cargando contactos…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>

  if (contactos.length === 0) {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-xl font-semibold">Contactos</h1>
        <p className="text-slate-400">
          Todavía no hay contactos cargados. Corré el seed de datos de prueba
          (<code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm">supabase/seed-demo.sql</code>)
          en el SQL Editor de Supabase para ver esta vista con datos reales.
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Contactos</h1>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Fuente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Clasificación</th>
              <th className="px-4 py-3">Frustración</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {contactos.map((c) => (
              <tr key={c.id} className="hover:bg-slate-900/60">
                <td className="px-4 py-3">
                  <Link to={`/contactos/${c.id}`} className="font-medium text-slate-100 hover:underline">
                    {c.nombre ?? c.email ?? 'Sin nombre'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{c.fuente ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400">{c.tipo}</td>
                <td className="px-4 py-3 font-mono">{c.current_score !== null ? Math.round(c.current_score) : '—'}</td>
                <td className="px-4 py-3"><ClasificacionBadge clasificacion={c.current_classification} /></td>
                <td className="px-4 py-3 font-mono text-slate-400">
                  {c.current_frustration_index !== null ? Math.round(c.current_frustration_index) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
