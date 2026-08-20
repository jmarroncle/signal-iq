import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseServer } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string

  if (req.method === 'PATCH') {
    const { error } = await supabaseServer.from('touchpoints').update(req.body).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseServer.from('touchpoints').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
