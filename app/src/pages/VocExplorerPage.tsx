import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fragmentosVocGlobal, crearFragmentoVoc, listarContactos, combGaps, obtenerProyectoId } from '../lib/queries'
import type { FragmentoVocConContacto, Contacto, CombGap } from '../types'
import { InfoLink } from '../components/InfoLink'

const dimensionEstilo: Record<string, string> = {
  capability: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  opportunity: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  motivation: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

const dimensionColorPunto: Record<string, string> = {
  capability: 'bg-sky-500',
  opportunity: 'bg-amber-500',
  motivation: 'bg-emerald-500',
}

const canalesConocidos = ['whatsapp', 'email', 'formulario', 'webinar', 'web']

const plantillaVacia = {
  contacto_id: '',
  canal: 'whatsapp',
  tag_semantico: '',
  score_intensidad: 50,
  texto_original: '',
}

export function VocExplorerPage() {
  const [fragmentos, setFragmentos] = useState<FragmentoVocConContacto[]>([])
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [gaps, setGaps] = useState<CombGap[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filtroCanal, setFiltroCanal] = useState('todos')
  const [filtroTag, setFiltroTag] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState(plantillaVacia)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  function cargar() {
    setCargando(true)
    Promise.all([fragmentosVocGlobal(), listarContactos(), combGaps()])
      .then(([f, c, g]) => {
        setFragmentos(f)
        setContactos(c)
        setGaps(g)
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [])

  function dimensionDeTag(tag: string | null): string | null {
    return gaps.find((g) => g.voc_tag === tag)?.comb_dimension ?? null
  }

  const canales = useMemo(
    () => [...new Set(fragmentos.map((f) => f.canal).filter((c): c is string => Boolean(c)))],
    [fragmentos],
  )
  const tags = useMemo(() => [...new Set(gaps.map((g) => g.voc_tag))], [gaps])

  const filtrados = fragmentos.filter((f) => {
    if (filtroCanal !== 'todos' && f.canal !== filtroCanal) return false
    if (filtroTag !== 'todos' && f.tag_semantico !== filtroTag) return false
    if (busqueda && !f.texto_original.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const conteoDimensiones = { capability: 0, opportunity: 0, motivation: 0 }
  for (const f of fragmentos) {
    const dim = dimensionDeTag(f.tag_semantico)
    if (dim && dim in conteoDimensiones) {
      conteoDimensiones[dim as keyof typeof conteoDimensiones]++
    }
  }
  const totalClasificado = conteoDimensiones.capability + conteoDimensiones.opportunity + conteoDimensiones.motivation

  async function guardar() {
    if (!form.contacto_id || !form.texto_original.trim()) {
      setErrorForm('Falta elegir un contacto o escribir el texto.')
      return
    }
    try {
      const projectId = await obtenerProyectoId()
      await crearFragmentoVoc({
        project_id: projectId,
        contacto_id: form.contacto_id,
        canal: form.canal,
        texto_original: form.texto_original.trim(),
        tag_semantico: form.tag_semantico || null,
        score_intensidad: form.tag_semantico ? form.score_intensidad : null,
      })
      setForm(plantillaVacia)
      setMostrarForm(false)
      setErrorForm(null)
      cargar()
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  if (cargando) return <div className="p-8 text-slate-400">Cargando VOC…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold">
          VOC Explorer
          <InfoLink slug="com-b" titulo="el modelo COM-B" />
        </h1>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
        >
          {mostrarForm ? 'Cancelar' : '+ Agregar fragmento VOC'}
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Todo el lenguaje real de los contactos, clasificado por brecha COM-B. En producción esto se llena solo
        (webhook de WhatsApp/email/formulario → clasificación con Claude Haiku); acá se puede cargar a mano para
        probar el loop completo VOC → Score → Frustración mientras esa integración no está conectada.
      </p>

      {mostrarForm && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/40 p-5">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">Contacto</label>
                <select
                  value={form.contacto_id}
                  onChange={(e) => setForm({ ...form, contacto_id: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                >
                  <option value="">— elegir —</option>
                  {contactos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre ?? c.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs text-slate-500">Canal</label>
                <select
                  value={form.canal}
                  onChange={(e) => setForm({ ...form, canal: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                >
                  {canalesConocidos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Texto</label>
              <textarea
                value={form.texto_original}
                onChange={(e) => setForm({ ...form, texto_original: e.target.value })}
                rows={3}
                placeholder="Lo que dijo el contacto, tal cual…"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">Tag semántico (brecha COM-B)</label>
                <select
                  value={form.tag_semantico}
                  onChange={(e) => setForm({ ...form, tag_semantico: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                >
                  <option value="">sin clasificar</option>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {form.tag_semantico && (
                <div className="w-40">
                  <label className="mb-1 block text-xs text-slate-500">Intensidad (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.score_intensidad}
                    onChange={(e) => setForm({ ...form, score_intensidad: Number(e.target.value) })}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>
            {errorForm && <p className="text-sm text-red-400">{errorForm}</p>}
            <button
              onClick={guardar}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-950"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {totalClasificado > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Distribución por brecha COM-B
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <div className="flex h-3">
              <div className="bg-sky-500" style={{ width: `${(conteoDimensiones.capability / totalClasificado) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(conteoDimensiones.opportunity / totalClasificado) * 100}%` }} />
              <div className="bg-emerald-500" style={{ width: `${(conteoDimensiones.motivation / totalClasificado) * 100}%` }} />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Capability — {conteoDimensiones.capability}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Opportunity — {conteoDimensiones.opportunity}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Motivation — {conteoDimensiones.motivation}
            </span>
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filtroCanal}
          onChange={(e) => setFiltroCanal(e.target.value)}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos los canales</option>
          {canales.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroTag}
          onChange={(e) => setFiltroTag(e.target.value)}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos los tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en el texto…"
          className="min-w-[200px] flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-500">
          Sin fragmentos VOC {fragmentos.length > 0 ? 'que coincidan con el filtro.' : 'todavía.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtrados.map((f) => {
            const dim = dimensionDeTag(f.tag_semantico)
            return (
              <li key={f.id} className="rounded-lg border border-slate-800 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Link to={`/contactos/${f.contacto.id}`} className="font-medium text-slate-300 hover:underline">
                    {f.contacto.nombre ?? f.contacto.email}
                  </Link>
                  {f.tag_semantico ? (
                    <span className={`rounded-full border px-2 py-0.5 ${dim ? dimensionEstilo[dim] : 'border-slate-700'}`}>
                      {dim && <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${dimensionColorPunto[dim]}`} />}
                      {f.tag_semantico}
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">sin clasificar</span>
                  )}
                  <span>{f.canal}</span>
                  {f.score_intensidad !== null && <span>· intensidad {f.score_intensidad}</span>}
                  <span>· {new Date(f.ocurrido_en).toLocaleString('es-AR')}</span>
                </div>
                <p className="text-slate-300">&quot;{f.texto_original}&quot;</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
