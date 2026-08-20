import type { Clasificacion } from '../types'

const estilos: Record<Clasificacion, string> = {
  HOT: 'bg-red-500/15 text-red-400 border-red-500/30',
  WARM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  COLD: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
}

export function ClasificacionBadge({ clasificacion }: { clasificacion: Clasificacion | null }) {
  if (!clasificacion) {
    return <span className="text-xs text-slate-500">sin score</span>
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${estilos[clasificacion]}`}>
      {clasificacion}
    </span>
  )
}
