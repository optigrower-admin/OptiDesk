import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renameDriveFolder as renameDriveFile } from '@/lib/drive'

// Migración de un solo uso: renombra los archivos_cliente que ya tienen
// tipo_documento (Carta de Negociación, Copia Cédula, etc.) al patrón
// "{Tipo}_{n}_{NOMBRE CLIENTE}.ext" — tanto en la base de datos como en el
// archivo real de Drive. Se dispara con la sesión normal de gerencia
// (abriendo esta URL en el navegador estando logueado), no con un secreto.
function nombreDesdeTipoDocumento(tipoDocumento: string, nombreCliente: string | null, seq: number, ext: string): string {
  const tipoSlug = tipoDocumento.trim().replace(/\s+/g, '_')
  const nombreSlug = (nombreCliente ?? 'CLIENTE').trim().toUpperCase().replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_')
  return `${tipoSlug}_${seq}_${nombreSlug}.${ext}`
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  if (perfil.rol !== 'gerencia') return NextResponse.json({ error: 'Solo gerencia puede ejecutar esta migración' }, { status: 403 })

  const tenantId = perfil.tenant_id as string
  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants').select('google_refresh_token').eq('id', tenantId).maybeSingle()
  const refreshToken = tenant?.google_refresh_token as string | null

  const { data: archivos, error } = await admin
    .from('archivos_cliente')
    .select('id, nombre_archivo, tipo_documento, storage_location, url, cliente_id, clientes(nombre)')
    .eq('tenant_id', tenantId)
    .not('tipo_documento', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!archivos?.length) return NextResponse.json({ ok: true, renombrados: 0, fallidos: 0, detalle: [] })

  const contador = new Map<string, number>()
  const detalle: { id: string; antes: string | null; despues: string; ok: boolean; error?: string }[] = []

  for (const a of archivos as unknown as { id: string; nombre_archivo: string | null; tipo_documento: string; storage_location: string; url: string; cliente_id: string; clientes: { nombre: string | null } | { nombre: string | null }[] | null }[]) {
    const clienteNombre = Array.isArray(a.clientes) ? a.clientes[0]?.nombre ?? null : a.clientes?.nombre ?? null
    const key = `${a.cliente_id}|${a.tipo_documento}`
    const seq = (contador.get(key) ?? 0) + 1
    contador.set(key, seq)

    const extActual = (a.nombre_archivo ?? '').split('.').pop() || 'pdf'
    const nuevoNombre = nombreDesdeTipoDocumento(a.tipo_documento, clienteNombre, seq, extActual)

    if (nuevoNombre === a.nombre_archivo) {
      detalle.push({ id: a.id, antes: a.nombre_archivo, despues: nuevoNombre, ok: true })
      continue
    }

    try {
      if (a.storage_location === 'drive') {
        if (!refreshToken) throw new Error('Tenant sin google_refresh_token')
        await renameDriveFile(a.url, nuevoNombre, refreshToken)
      }
      const { error: upErr } = await admin.from('archivos_cliente').update({ nombre_archivo: nuevoNombre }).eq('id', a.id)
      if (upErr) throw upErr
      detalle.push({ id: a.id, antes: a.nombre_archivo, despues: nuevoNombre, ok: true })
    } catch (e) {
      detalle.push({ id: a.id, antes: a.nombre_archivo, despues: nuevoNombre, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const renombrados = detalle.filter(d => d.ok).length
  const fallidos = detalle.filter(d => !d.ok).length
  return NextResponse.json({ ok: true, renombrados, fallidos, detalle })
}
