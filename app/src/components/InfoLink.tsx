import { Link } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'

/** Ícono "?" contextual que linkea a un artículo de la wiki (docs/07-wiki-metricas.md). */
export function InfoLink({ slug, titulo }: { slug: string; titulo: string }) {
  return (
    <Link
      to={`/wiki/${slug}`}
      title={`¿Qué es ${titulo}?`}
      className="inline-flex text-slate-500 hover:text-slate-300"
    >
      <HelpCircle size={14} />
    </Link>
  )
}
