import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { downloadFromR2 } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const r2Key = req.nextUrl.searchParams.get('key')
  if (!r2Key) return new NextResponse('Falta key', { status: 400 })

  try {
    const buffer = await downloadFromR2(r2Key)
    const ext = r2Key.split('.').pop()?.toLowerCase() ?? 'jpg'
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('No encontrado', { status: 404 })
  }
}
