import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseServer } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from('touchpoints')
      .select('*')
      .order('priority', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { error } = await supabaseServer.from('touchpoints').insert(req.body)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
