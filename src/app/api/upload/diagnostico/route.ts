import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedUploadUrl, deleteFromR2 } from '@/lib/r2'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const key = `test-diag/${user.id}/test_${Date.now()}.mp4`
  try {
    const presignedUrl = await getSignedUploadUrl(key, 'video/mp4', 600)
    return NextResponse.json({ ok: true, presignedUrl, key, contentType: 'video/mp4' })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { key } = await req.json() as { key: string }
  if (!key || !key.startsWith('test-diag/')) {
    return NextResponse.json({ error: 'Key inválida' }, { status: 400 })
  }
  try {
    await deleteFromR2(key)
  } catch { /* ignore cleanup errors */ }
  return NextResponse.json({ ok: true })
}
