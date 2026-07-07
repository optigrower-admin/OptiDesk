import { createClient } from '@supabase/supabase-js'

// Cliente con service role key — solo usar en server-side (API routes, server actions)
export function createAdminClient() {
  // strip surrounding quotes in case the env var was saved with them in Vercel
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^["']+|["']+$/g, '')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
