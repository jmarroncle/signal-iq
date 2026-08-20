import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarActividadGlobal } from '../lib/queries'
import type { ActividadItem, OrigenActividad } from '../types'

const origenEstilo: Record<OrigenActividad, string> = {
  evento: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  voc: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  deal: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

const origenEtiqueta: Record<OrigenActividad, string> = {
  evento: 'Evento',
  voc: 'VOC',
  deal: 'Deal',
}

function tituloDia(fecha: Date): string {
  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  const mismodia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mismodia(fecha, hoy)) return 'Hoy'
  if (mismodia(fecha, ayer)) return 'Ayer'
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

export function ActividadGlobalPage() {
  const [items, setItems] = useState<ActividadItem[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarActividadGlobal()
      .then(({ items, nombres }) => {
        setItems(items)
        setNombres(nombres)
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <div className="p-8 text-slate-400">Cargando actividad…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>

  if (items.length === 0) {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-xl font-semibold">Actividad global</h1>
        <p className="text-slate-400">Todavía no hay actividad registrada (eventos, VOC o cambios de etapa).</p>
      </div>
    )
  }

  // agrupar por día conservando el orden ya descendente de la query
  const grupos: { titulo: string; items: ActividadItem[] }[] = []
  for (const item of items) {
    const titulo = tituloDia(new Date(item.ocurrido_en))
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.titulo === titulo) {
      ultimo.items.push(item)
    } else {
      grupos.push({ titulo, items: [item] })
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-xl font-semibold">Actividad global</h1>
      <div className="space-y-8">
        {grupos.map((grupo) => (
          <section key={grupo.titulo}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{grupo.titulo}</h2>
            <ul className="space-y-2">
              {grupo.items.map((item) => (
                <li key={`${item.origen}-${item.id}`} className="flex items-start gap-3 rounded-lg border border-slate-800 p-3">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-slate-500">
                    {new Date(item.ocurrido_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${origenEstilo[item.origen]}`}>
                    {origenEtiqueta[item.origen]}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link to={`/contactos/${item.contacto_id}`} className="font-medium hover:underline">
                      {nombres[item.contacto_id] ?? 'Contacto'}
                    </Link>
                    <span className="text-slate-400">
                      {' — '}
                      {item.tipo ?? 'sin tipo'}
                      {item.canal ? ` · ${item.canal}` : ''}
                    </span>
                    {item.detalle && <p className="mt-1 truncate text-slate-500">"{item.detalle}"</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
