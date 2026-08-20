import { createClient } from '@supabase/supabase-js'

// Mismos valores que src/lib/supabase.ts: la anon key es "publishable" (segura de
// exponer) y ya está pública en el bundle del cliente — moverla al server no cambia
// su nivel de secreto, pero saca la llamada directa a Supabase del navegador.
const SUPABASE_URL = 'https://falmewxrgsyjtbmojjlm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_rjpwTZq4GpU44wPwbfETJQ_7QtCKRbD'

export const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'signal_iq' },
})
