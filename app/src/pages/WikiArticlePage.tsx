import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { marked } from 'marked'
import { obtenerArticuloWiki } from '../lib/queries'
import type { WikiArticle } from '../types'

export function WikiArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [articulo, setArticulo] = useState<WikiArticle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    obtenerArticuloWiki(slug)
      .then(setArticulo)
      .catch((e) => setError(e.message))
  }, [slug])

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!articulo) return <div className="p-8 text-slate-400">Cargando…</div>

  const html = marked.parse(articulo.contenido_md, { async: false })

  return (
    <div className="mx-auto max-w-2xl p-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={14} /> Volver
      </button>
      <h1 className="mb-6 text-2xl font-semibold">{articulo.titulo}</h1>
      <div className="wiki-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
