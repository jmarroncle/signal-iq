import { useEffect, useState } from 'react'
import { listarTouchpoints, crearTouchpoint, actualizarTouchpoint, eliminarTouchpoint, obtenerProyectoId } from '../lib/queries'
import type { Touchpoint, TriggerConditions, CanalTouchpoint } from '../types'

const canalEstilo: Record<CanalTouchpoint, string> = {
  email: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  whatsapp: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  sms: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  push: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

function describirCondiciones(tc: TriggerConditions | null): string {
  if (!tc) return 'sin condiciones (dispara siempre)'
  const partes: string[] = []
  if (tc.score_min !== undefined || tc.score_max !== undefined) {
    partes.push(`score ${tc.score_min ?? 0}–${tc.score_max ?? 100}`)
  }
  if (tc.frustration_min !== undefined || tc.frustration_max !== undefined) {
    partes.push(`frustración ${tc.frustration_min ?? 0}–${tc.frustration_max ?? 100}`)
  }
  if (tc.clasificacion?.length) partes.push(`clasificación: ${tc.clasificacion.join(', ')}`)
  if (tc.tipo_contacto) partes.push(`tipo: ${tc.tipo_contacto}`)
  if (tc.tags_requeridos?.length) partes.push(`tags VOC: ${tc.tags_requeridos.join(', ')}`)
  if (tc.pipeline_tipo) partes.push(`pipeline ${tc.pipeline_tipo}${tc.etapa ? ` · etapa "${tc.etapa}"` : ''}`)
  if (tc.custom_fields_match) partes.push(`campos: ${JSON.stringify(tc.custom_fields_match)}`)
  if (tc.cooldown_dias !== undefined) partes.push(`cooldown ${tc.cooldown_dias}d`)
  return partes.length > 0 ? partes.join(' · ') : 'sin condiciones (dispara siempre)'
}

const plantillaVacia = {
  name: '',
  channel: 'email' as CanalTouchpoint,
  priority: 0,
  activo: true,
  template_ref: '',
  trigger_conditions: '{\n  "clasificacion": ["HOT"],\n  "cooldown_dias": 7\n}',
}

export function TouchpointsPage() {
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null)
  const [form, setForm] = useState(plantillaVacia)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  function cargar() {
    setCargando(true)
    listarTouchpoints()
      .then(setTouchpoints)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [])

  function abrirEdicion(t: Touchpoint) {
    setEditando(t.id)
    setForm({
      name: t.name,
      channel: t.channel,
      priority: t.priority,
      activo: t.activo,
      template_ref: t.template_ref ?? '',
      trigger_conditions: JSON.stringify(t.trigger_conditions ?? {}, null, 2),
    })
    setErrorForm(null)
  }

  function abrirNuevo() {
    setEditando('nuevo')
    setForm(plantillaVacia)
    setErrorForm(null)
  }

  async function guardar() {
    let condiciones: TriggerConditions
    try {
      condiciones = JSON.parse(form.trigger_conditions)
    } catch {
      setErrorForm('Las condiciones no son un JSON válido.')
      return
    }
    const payload = {
      name: form.name,
      channel: form.channel,
      priority: form.priority,
      activo: form.activo,
      template_ref: form.template_ref || null,
      trigger_conditions: condiciones,
      comb_gap_id: null,
    }
    try {
      if (editando === 'nuevo') {
        const projectId = await obtenerProyectoId()
        await crearTouchpoint({ ...payload, project_id: projectId })
      } else if (editando) {
        await actualizarTouchpoint(editando, payload)
      }
      setEditando(null)
      cargar()
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function toggleActivo(t: Touchpoint) {
    await actualizarTouchpoint(t.id, { activo: !t.activo })
    cargar()
  }

  async function eliminar(id: string) {
    await eliminarTouchpoint(id)
    cargar()
  }

  if (cargando) return <div className="p-8 text-slate-400">Cargando…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Touchpoints</h1>
        <button
          onClick={abrirNuevo}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
        >
          + Nuevo touchpoint
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Lista de reglas — no es un editor visual de flujos. El motor evalúa estas condiciones automáticamente cada
        vez que llega un evento, se clasifica un fragmento VOC, o cambia la etapa de un deal.
      </p>

      {touchpoints.length === 0 && editando === null && (
        <p className="text-sm text-slate-500">Todavía no hay touchpoints configurados.</p>
      )}

      <div className="space-y-2">
        {touchpoints.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-800 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${canalEstilo[t.channel]}`}>
                  {t.channel}
                </span>
                <span className="text-xs text-slate-500">prioridad {t.priority}</span>
                {!t.activo && <span className="text-xs text-amber-500">pausado</span>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => toggleActivo(t)} className="text-slate-400 hover:text-slate-200">
                  {t.activo ? 'Pausar' : 'Activar'}
                </button>
                <button onClick={() => abrirEdicion(t)} className="text-slate-400 hover:text-slate-200">
                  Editar
                </button>
                <button onClick={() => eliminar(t.id)} className="text-red-500 hover:text-red-400">
                  Eliminar
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-400">{describirCondiciones(t.trigger_conditions)}</p>
            {t.template_ref && <p className="mt-1 font-mono text-xs text-slate-600">template: {t.template_ref}</p>}
          </div>
        ))}
      </div>

      {editando !== null && (
        <div className="mt-6 rounded-lg border border-slate-700 bg-slate-900/40 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {editando === 'nuevo' ? 'Nuevo touchpoint' : 'Editar touchpoint'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Nombre</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">Canal</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value as CanalTouchpoint })}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                >
                  <option value="email">email</option>
                  <option value="whatsapp">whatsapp</option>
                  <option value="sms">sms</option>
                  <option value="push">push</option>
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs text-slate-500">Prioridad</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  />
                  activo
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Template (referencia en Klaviyo/Wati)</label>
              <input
                value={form.template_ref}
                onChange={(e) => setForm({ ...form, template_ref: e.target.value })}
                placeholder="ej: klaviyo-tpl-nutricion-warm"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                Condiciones (JSON — ver docs/08-touchpoints-automatizacion.md)
              </label>
              <textarea
                value={form.trigger_conditions}
                onChange={(e) => setForm({ ...form, trigger_conditions: e.target.value })}
                rows={6}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs"
              />
            </div>
            {errorForm && <p className="text-sm text-red-400">{errorForm}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={guardar} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-950">
                Guardar
              </button>
              <button onClick={() => setEditando(null)} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
