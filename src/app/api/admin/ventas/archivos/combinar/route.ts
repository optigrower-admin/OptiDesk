import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromDrive } from '@/lib/drive'
import { downloadFromR2 } from '@/lib/r2'
import { PDFDocument } from 'pdf-lib'

interface ArchivoRow {
  id: string
  tipo: string
  nombre_archivo: string | null
  url: string
  storage_location: 'drive' | 'r2'
  cliente_id: string
}

function esPNG(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const body = await req.json().catch(() => null) as { ids?: string[] } | null
  const ids = body?.ids ?? []
  if (ids.length === 0) return NextResponse.json({ error: 'Selecciona al menos un archivo' }, { status: 400 })

  const admin = createAdminClient()
  const [{ data: archivos }, { data: tenant }] = await Promise.all([
    admin.from('archivos_cliente').select('id, tipo, nombre_archivo, url, storage_location, cliente_id')
      .in('id', ids).eq('tenant_id', perfil.tenant_id),
    admin.from('tenants').select('google_refresh_token').eq('id', perfil.tenant_id).single(),
  ])

  if (!archivos?.length) return NextResponse.json({ error: 'No se encontraron los archivos' }, { status: 404 })

  // Mismo orden en que el usuario los seleccionó
  const porId = new Map((archivos as ArchivoRow[]).map(a => [a.id, a]))
  const ordenados = ids.map(id => porId.get(id)).filter((a): a is ArchivoRow => !!a)

  const combinables = ordenados.filter(a => a.tipo === 'pdf' || a.tipo === 'imagen')
  if (combinables.length === 0) {
    return NextResponse.json({ error: 'Solo se pueden combinar archivos PDF o imágenes' }, { status: 400 })
  }

  try {
    const merged = await PDFDocument.create()

    for (const archivo of combinables) {
      let bytes: Buffer
      if (archivo.storage_location === 'drive') {
        bytes = await downloadFromDrive(archivo.url, tenant?.google_refresh_token)
      } else {
        bytes = await downloadFromR2(archivo.url)
      }

      if (archivo.tipo === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const paginas = await merged.copyPages(src, src.getPageIndices())
        paginas.forEach(p => merged.addPage(p))
      } else {
        const img = esPNG(bytes) ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
        const anchoPagina = 595
        const altoPagina = Math.min(842, Math.round(anchoPagina * img.height / img.width))
        const page = merged.addPage([anchoPagina, altoPagina])
        page.drawImage(img, { x: 0, y: 0, width: anchoPagina, height: altoPagina })
      }
    }

    const pdfBytes = await merged.save()
    const clienteId = ordenados[0]?.cliente_id
    const { data: cliente } = clienteId
      ? await admin.from('clientes').select('nombre').eq('id', clienteId).maybeSingle()
      : { data: null }
    const nombreArchivo = `${(cliente?.nombre ?? 'documentos').replace(/[<>:"/\\|?*]/g, '_')} - combinado.pdf`

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido al combinar los archivos'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
