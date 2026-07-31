import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSignedDownloadUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: job, error } = await supabase
    .from('export_jobs').select('*')
    .eq('id', params.id)
    .single()
  if (error || !job) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  let urlDescarga: string | null = null
  if (job.status === 'LISTO' && job.archivo_url) {
    urlDescarga = await getSignedDownloadUrl(job.archivo_url, 3600, `consulta.${job.formato}`)
  }

  return NextResponse.json({ job, urlDescarga })
}
