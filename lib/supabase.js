import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

const hasValidUrl = (value) => {
  try {
    return Boolean(value && new URL(value).protocol.startsWith('http'))
  } catch {
    return false
  }
}

export const supabaseConfigError = !hasValidUrl(supabaseUrl)
  ? 'Missing or invalid NEXT_PUBLIC_SUPABASE_URL.'
  : !supabaseKey
    ? 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    : ''

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseKey)
