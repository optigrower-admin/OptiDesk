import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedUploadUrl } from '@/lib/r2'

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp', '.m4v', '.wmv', '.flv', '.ts'])

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const { orden_id, tipo, filename, filetype } = await req.json() as {
    orden_id: string; tipo: 'imagen' | 'video'; filename: string; filetype: string
  }

  if (!['imagen', 'video'].includes(tipo) || !orden_id || !filename) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  // Si el tenant tiene Drive configurado y es una imagen → subir a Drive
  if (tipo === 'imagen') {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('google_refresh_token, drive_folder_id')
      .eq('id', perfil.tenant_id)
      .single()
    if (tenant?.google_refresh_token && tenant.drive_folder_id) {
      return NextResponse.json({ mode: 'drive' })
    }
  }

  const { data: orden } = await supabase.from('ordenes')
    .select('placa, numero').eq('id', orden_id).single()

  const placa = (orden?.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_')
  const numero = orden?.numero ?? 0
  const ext = (filename.split('.').pop()?.toLowerCase()) ?? (tipo === 'imagen' ? 'jpg' : 'mp4')
  const timestamp = Date.now()
  const nombreArchivo = `${placa}_#${numero}_${timestamp}.${ext}`
  const key = `${perfil.tenant_id}/${placa}/${nombreArchivo}`

  // Normalizar el content-type para OPPO/Huawei (envían application/octet-stream)
  let contentType = filetype || ''
  if (tipo === 'video' && (!contentType || contentType === 'application/octet-stream')) {
    const extDot = '.' + ext
    if (VIDEO_EXTS.has(extDot)) {
      contentType = extDot === '.mov' ? 'video/quicktime'
        : extDot === '.3gp' ? 'video/3gpp'
        : extDot === '.mkv' ? 'video/x-matroska'
        : extDot === '.webm' ? 'video/webm'
        : 'video/mp4'
    } else {
      contentType = 'video/mp4'
    }
  }
  if (tipo === 'imagen' && (!contentType || contentType === 'application/octet-stream')) {
    contentType = 'image/jpeg'
  }

  const presignedUrl = await getSignedUploadUrl(key, contentType)

  return NextResponse.json({ url: presignedUrl, key, nombreArchivo, contentType })
}
