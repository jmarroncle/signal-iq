import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, LayoutGrid, ArrowUp, ArrowDown, X } from 'lucide-react'
import { listarEsquemaTemplates, obtenerProyecto, actualizarEsquemaConfig } from '../lib/queries'
import type { EsquemaTemplate, EsquemaConfig, CampoCustom, TipoCampoCustom, EtapaTipo } from '../types'

type Paso = 'crm' | 'modo' | 'selector' | 'preview' | 'confirmacion' | 'resumen'

const tiposCampo: TipoCampoCustom[] = ['texto', 'numero', 'fecha', 'booleano', 'seleccion']

const colorEtapaTipo: Record<EtapaTipo, string> = {
  abierta: 'border-slate-700 text-slate-300',
  ganado: 'border-emerald-500/40 text-emerald-400',
  perdido: 'border-red-500/40 text-red-400',
}

const tagsBaseVoc = [
  { tag: 'confusion', dim: 'capability' },
  { tag: 'precio', dim: 'motivation' },
  { tag: 'riesgo_legal', dim: 'opportunity' },
  { tag: 'intencion_compra', dim: 'motivation' },
  { tag: 'proceso_complejo', dim: 'capability' },
]

function ChipsEditor({
  valores,
  onChange,
  placeholder,
}: {
  valores: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [nuevo, setNuevo] = useState('')

  function agregar() {
    const v = nuevo.trim()
    if (!v || valores.includes(v)) return
    onChange([...valores, v])
    setNuevo('')
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {valores.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {v}
            <button onClick={() => onChange(valores.filter((x) => x !== v))} className="text-slate-500 hover:text-red-400">
              <X size={11} />
            </button>
          </span>
        ))}
        {valores.length === 0 && <span className="text-xs text-slate-600">ninguno todavía</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              agregar()
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
        />
        <button onClick={agregar} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-900">
          + agregar
        </button>
      </div>
    </div>
  )
}

function CamposCustomEditor({ campos, onChange }: { campos: CampoCustom[]; onChange: (c: CampoCustom[]) => void }) {
  function actualizar(i: number, cambios: Partial<CampoCustom>) {
    onChange(campos.map((c, idx) => (idx === i ? { ...c, ...cambios } : c)))
  }
  function eliminar(i: number) {
    onChange(campos.filter((_, idx) => idx !== i))
  }
  function agregar() {
    onChange([...campos, { clave: `campo_${campos.length + 1}`, etiqueta: '', tipo: 'texto' }])
  }

  return (
    <div className="space-y-2">
      {campos.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={c.etiqueta}
            onChange={(e) => actualizar(i, { etiqueta: e.target.value })}
            placeholder="Nombre del campo"
            className="min-w-[140px] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          />
          <select
            value={c.tipo}
            onChange={(e) => actualizar(i, { tipo: e.target.value as TipoCampoCustom })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          >
            {tiposCampo.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {c.tipo === 'seleccion' && (
            <input
              value={(c.opciones ?? []).join(', ')}
              onChange={(e) => actualizar(i, { opciones: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
              placeholder="opciones separadas por coma"
              className="min-w-[160px] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
            />
          )}
          <button onClick={() => eliminar(i)} className="text-slate-500 hover:text-red-400">
            <X size={14} />
          </button>
        </div>
      ))}
      <button onClick={agregar} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-900">
        + agregar campo
      </button>
    </div>
  )
}

export function ConstructorPanelPage() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState<Paso>('crm')
  const [mostrarStubCrm, setMostrarStubCrm] = useState(false)
  const [templates, setTemplates] = useState<EsquemaTemplate[]>([])
  const [proyectoId, setProyectoId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [templateElegido, setTemplateElegido] = useState<EsquemaTemplate | null>(null)
  const [esquema, setEsquema] = useState<EsquemaConfig | null>(null)
  const [esquemaGuardado, setEsquemaGuardado] = useState<EsquemaConfig | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([listarEsquemaTemplates(), obtenerProyecto()])
      .then(([t, p]) => {
        setTemplates(t)
        setProyectoId(p.id)
        if (p.esquema_config && 'tipo_negocio' in p.esquema_config) {
          setEsquemaGuardado(p.esquema_config as EsquemaConfig)
          setPaso('resumen')
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  function elegirTemplate(t: EsquemaTemplate) {
    setTemplateElegido(t)
    setEsquema(JSON.parse(JSON.stringify(t.esquema_config)))
    setPaso('preview')
  }

  function volverAElegir() {
    setTemplateElegido(null)
    setEsquema(null)
    setPaso('modo')
  }

  function moverEtapa(i: number, dir: -1 | 1) {
    if (!esquema) return
    const etapas = [...esquema.entidades.deal.etapas_pipeline]
    const j = i + dir
    if (j < 0 || j >= etapas.length) return
    ;[etapas[i], etapas[j]] = [etapas[j], etapas[i]]
    setEsquema({ ...esquema, entidades: { ...esquema.entidades, deal: { ...esquema.entidades.deal, etapas_pipeline: etapas } } })
  }

  async function confirmar() {
    if (!esquema || !proyectoId) return
    setGuardando(true)
    try {
      await actualizarEsquemaConfig(proyectoId, esquema)
      setEsquemaGuardado(esquema)
      setPaso('confirmacion')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar el esquema')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <div className="p-8 text-slate-400">Cargando…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-xl font-semibold">Constructor de Panel</h1>
      <p className="mb-8 text-sm text-slate-500">
        Define qué campos, etapas y tags usa tu panel — sin crear tablas nuevas, solo configuración.
      </p>

      {paso === 'resumen' && esquemaGuardado && (
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-300">
              Plantilla base: <strong>{templates.find((t) => t.slug === esquemaGuardado.tipo_negocio)?.nombre ?? esquemaGuardado.tipo_negocio}</strong>
              {esquemaGuardado.generado_por === 'chat' ? ' · generado con Modo Chat' : ' · generado con Modo Selector'}
            </p>
            <button
              onClick={() => setPaso('modo')}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
            >
              Reconfigurar
            </button>
          </div>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Terminología</h3>
            <p className="text-sm text-slate-400">
              Contacto se llama <strong className="text-slate-200">{esquemaGuardado.terminologia.contacto}</strong> · Deal se llama{' '}
              <strong className="text-slate-200">{esquemaGuardado.terminologia.deal}</strong>
            </p>
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">
              {esquemaGuardado.terminologia.contacto} — campos custom
            </h3>
            {esquemaGuardado.entidades.contacto.campos_custom.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguno.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-400">
                {esquemaGuardado.entidades.contacto.campos_custom.map((c) => (
                  <li key={c.clave}>
                    {c.etiqueta} <span className="text-slate-600">({c.tipo}{c.opciones?.length ? `: ${c.opciones.join(', ')}` : ''})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">{esquemaGuardado.terminologia.deal} — etapas del pipeline</h3>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {esquemaGuardado.entidades.deal.etapas_pipeline.map((et) => (
                <span key={et.label} className={`rounded-full border px-2 py-0.5 text-xs ${colorEtapaTipo[et.tipo]}`}>
                  {et.label}
                </span>
              ))}
            </div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Campos custom</h4>
            {esquemaGuardado.entidades.deal.campos_custom.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguno.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-400">
                {esquemaGuardado.entidades.deal.campos_custom.map((c) => (
                  <li key={c.clave}>
                    {c.etiqueta} <span className="text-slate-600">({c.tipo}{c.opciones?.length ? `: ${c.opciones.join(', ')}` : ''})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Eventos</h3>
            <p className="mb-1 text-xs text-slate-500">Canales sugeridos</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {esquemaGuardado.entidades.evento.canales_sugeridos.map((c) => (
                <span key={c} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {c}
                </span>
              ))}
            </div>
            <p className="mb-1 text-xs text-slate-500">Tipos de evento sugeridos</p>
            <div className="flex flex-wrap gap-1.5">
              {esquemaGuardado.entidades.evento.tipos_evento_sugeridos.map((t) => (
                <span key={t} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {t}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">VOC — tags custom</h3>
            {esquemaGuardado.entidades.fragmento_voc.tags_custom.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguno — solo los 5 tags base.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {esquemaGuardado.entidades.fragmento_voc.tags_custom.map((t) => (
                  <span key={t} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-slate-600">
            Esto es lo que hay guardado en la base — todavía no se refleja en el resto del CRM (Contactos, Pipeline,
            etc. siguen usando los nombres y campos fijos por ahora).
          </p>
        </div>
      )}

      {paso === 'crm' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">¿Ya usás un CRM?</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              onClick={() => setMostrarStubCrm(true)}
              className="rounded-lg border border-slate-800 p-5 text-left hover:border-slate-600"
            >
              <p className="font-medium">Sí, ya uso un CRM</p>
              <p className="mt-1 text-xs text-slate-500">HubSpot, Pipedrive, Salesforce, Zoho u otro</p>
            </button>
            <button
              onClick={() => setPaso('modo')}
              className="rounded-lg border border-slate-800 p-5 text-left hover:border-slate-600"
            >
              <p className="font-medium">No, todavía no tengo uno</p>
              <p className="mt-1 text-xs text-slate-500">
                Armamos todo esto en una planilla / no tenemos nada centralizado todavía
              </p>
            </button>
          </div>
          {mostrarStubCrm && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-slate-300">
              Esto lo estamos construyendo — mientras tanto arrancá con el panel nativo. Vas a poder conectar tu CRM
              después desde Configuración → Integraciones, sin perder nada de lo que armes acá.
              <div className="mt-3">
                <button
                  onClick={() => setPaso('modo')}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
                >
                  Empezar con el panel nativo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {paso === 'modo' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Elegí cómo armarlo</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 p-5 opacity-50">
              <MessageCircle size={20} className="mb-2 text-slate-500" />
              <p className="font-medium">Modo Chat</p>
              <p className="mt-1 text-xs text-slate-500">Contanos de tu negocio y armamos el panel juntos</p>
              <p className="mt-3 text-xs text-amber-500">Próximamente — todavía no está conectado a Claude.</p>
            </div>
            <button
              onClick={() => setPaso('selector')}
              className="rounded-lg border border-slate-800 p-5 text-left hover:border-slate-600"
            >
              <LayoutGrid size={20} className="mb-2 text-slate-400" />
              <p className="font-medium">Modo Selector</p>
              <p className="mt-1 text-xs text-slate-500">4 plantillas listas para usar</p>
            </button>
          </div>
        </div>
      )}

      {paso === 'selector' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Elegí la que más se parece a tu negocio</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => elegirTemplate(t)}
                className="rounded-lg border border-slate-800 p-5 text-left hover:border-slate-600"
              >
                <p className="font-medium">{t.nombre}</p>
                <p className="mt-1 text-xs text-slate-500">{t.descripcion}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setPaso('modo')} className="text-xs text-slate-500 hover:text-slate-300">
            ← Volver
          </button>
        </div>
      )}

      {paso === 'preview' && esquema && templateElegido && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
            Plantilla elegida: <strong>{templateElegido.nombre}</strong> — {templateElegido.descripcion}
          </div>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">
              {esquema.terminologia.contacto} — campos custom
            </h3>
            <CamposCustomEditor
              campos={esquema.entidades.contacto.campos_custom}
              onChange={(c) =>
                setEsquema({ ...esquema, entidades: { ...esquema.entidades, contacto: { campos_custom: c } } })
              }
            />
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">{esquema.terminologia.deal} — etapas del pipeline</h3>
            <div className="mb-4 space-y-2">
              {esquema.entidades.deal.etapas_pipeline.map((et, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moverEtapa(i, -1)}
                      disabled={i === 0}
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-20"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => moverEtapa(i, 1)}
                      disabled={i === esquema.entidades.deal.etapas_pipeline.length - 1}
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-20"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                  <input
                    value={et.label}
                    onChange={(e) => {
                      const etapas = esquema.entidades.deal.etapas_pipeline.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value } : x,
                      )
                      setEsquema({ ...esquema, entidades: { ...esquema.entidades, deal: { ...esquema.entidades.deal, etapas_pipeline: etapas } } })
                    }}
                    className={`flex-1 rounded border bg-slate-950 px-2 py-1 text-xs ${colorEtapaTipo[et.tipo]}`}
                  />
                  <select
                    value={et.tipo}
                    onChange={(e) => {
                      const etapas = esquema.entidades.deal.etapas_pipeline.map((x, idx) =>
                        idx === i ? { ...x, tipo: e.target.value as EtapaTipo } : x,
                      )
                      setEsquema({ ...esquema, entidades: { ...esquema.entidades, deal: { ...esquema.entidades.deal, etapas_pipeline: etapas } } })
                    }}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                  >
                    <option value="abierta">abierta</option>
                    <option value="ganado">ganado</option>
                    <option value="perdido">perdido</option>
                  </select>
                  <button
                    onClick={() => {
                      const etapas = esquema.entidades.deal.etapas_pipeline.filter((_, idx) => idx !== i)
                      setEsquema({ ...esquema, entidades: { ...esquema.entidades, deal: { ...esquema.entidades.deal, etapas_pipeline: etapas } } })
                    }}
                    className="text-slate-500 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const etapas = [...esquema.entidades.deal.etapas_pipeline, { label: 'Nueva etapa', tipo: 'abierta' as EtapaTipo }]
                  setEsquema({ ...esquema, entidades: { ...esquema.entidades, deal: { ...esquema.entidades.deal, etapas_pipeline: etapas } } })
                }}
                className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-900"
              >
                + agregar etapa
              </button>
            </div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Campos custom</h4>
            <CamposCustomEditor
              campos={esquema.entidades.deal.campos_custom}
              onChange={(c) =>
                setEsquema({ ...esquema, entidades: { ...esquema.entidades, deal: { ...esquema.entidades.deal, campos_custom: c } } })
              }
            />
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Eventos</h3>
            <p className="mb-1 text-xs text-slate-500">Canales sugeridos</p>
            <div className="mb-4">
              <ChipsEditor
                valores={esquema.entidades.evento.canales_sugeridos}
                placeholder="ej: sms"
                onChange={(v) =>
                  setEsquema({ ...esquema, entidades: { ...esquema.entidades, evento: { ...esquema.entidades.evento, canales_sugeridos: v } } })
                }
              />
            </div>
            <p className="mb-1 text-xs text-slate-500">Tipos de evento sugeridos</p>
            <ChipsEditor
              valores={esquema.entidades.evento.tipos_evento_sugeridos}
              placeholder="ej: demo_agendada"
              onChange={(v) =>
                setEsquema({ ...esquema, entidades: { ...esquema.entidades, evento: { ...esquema.entidades.evento, tipos_evento_sugeridos: v } } })
              }
            />
          </section>

          <section className="rounded-lg border border-slate-800 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">VOC — brechas COM-B</h3>
            <p className="mb-1 text-xs text-slate-500">Tags base (estructurales, no editables — alimentan el scoring)</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {tagsBaseVoc.map((t) => (
                <span key={t.tag} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {t.tag}
                </span>
              ))}
            </div>
            <p className="mb-1 text-xs text-slate-500">Tags custom (opcional)</p>
            <ChipsEditor
              valores={esquema.entidades.fragmento_voc.tags_custom}
              placeholder="ej: soporte_lento"
              onChange={(v) =>
                setEsquema({ ...esquema, entidades: { ...esquema.entidades, fragmento_voc: { tags_custom: v } } })
              }
            />
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={confirmar}
              disabled={guardando}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Usar este esquema'}
            </button>
            <button onClick={volverAElegir} className="rounded-md border border-slate-700 px-4 py-2 text-sm">
              Volver a elegir
            </button>
          </div>
        </div>
      )}

      {paso === 'confirmacion' && templateElegido && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5">
            <h2 className="mb-1 text-lg font-semibold text-emerald-400">Tu panel está listo</h2>
            <p className="text-sm text-slate-300">
              Esquema de <strong>{templateElegido.nombre}</strong> aplicado — {esquema?.entidades.contacto.campos_custom.length ?? 0} campos
              de {esquema?.terminologia.contacto}, {esquema?.entidades.deal.etapas_pipeline.length ?? 0} etapas de{' '}
              {esquema?.terminologia.deal}.
            </p>
          </div>
          <button onClick={() => navigate('/')} className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950">
            Ir al panel
          </button>
        </div>
      )}
    </div>
  )
}
