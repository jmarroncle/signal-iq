/** Barra 0-100 con color según umbral (score: más alto = mejor; frustración: más alto = peor). */
export function Medidor({
  valor,
  etiqueta,
  invertido = false,
}: {
  valor: number | null
  etiqueta: string
  invertido?: boolean
}) {
  const v = valor ?? 0
  const color = invertido
    ? v >= 75
      ? 'bg-red-500'
      : v >= 50
        ? 'bg-amber-500'
        : 'bg-emerald-500'
    : v >= 70
      ? 'bg-emerald-500'
      : v >= 40
        ? 'bg-amber-500'
        : 'bg-slate-500'

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span>{etiqueta}</span>
        <span className="font-mono text-slate-200">{valor === null ? '—' : Math.round(valor)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  )
}
