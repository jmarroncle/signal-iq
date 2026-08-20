import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local')
}

// db.schema apunta al schema propio de Signal IQ, no al "public" que usa
// la vApp de Behavioral Design (mismo proyecto de Supabase, "Behavioral platform").
export const supabase = createClient(url, anonKey, {
  db: { schema: 'signal_iq' },
})
