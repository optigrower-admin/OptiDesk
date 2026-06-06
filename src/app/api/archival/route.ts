import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { archiveToLimit } from '@/lib/archiveToLimit'
import { registrarAuditoria } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!perfil || perfil.rol !== 'control_total') {
    return NextResponse.json({ error: 'Solo control_total puede ejecutar esto' }, { status: 403 })
  }

  const body = await req.json()
  const tenantId: string = body.tenant_id
  const force: boolean   = body.force ?? false

  if (!tenantId) return NextResponse.json({ error: 'Falta tenant_id' }, { status: 400 })

  // Fetchear tenant con el cliente autenticado del usuario (funciona con la sesión activa)
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('storage_usado_bytes, archivado_drive_habilitado, drive_folder_id, google_refresh_token')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json(
      { error: `Empresa no encontrada: ${tenantError?.message ?? 'sin datos'}` },
      { status: 404 },
    )
  }

  try {
    const { archivados, bytesLiberados, errores } = await archiveToLimit(
      tenantId,
      tenant,
      supabase,
      force,
    )

    if (archivados > 0) {
      try {
        const admin = createAdminClient()
        await registrarAuditoria(admin, {
          tenant_id: tenantId,
          tabla: 'medios',
          registro_id: tenantId,
          tipo: 'movimiento',
          descripcion: `Archivado ${force ? 'manual' : 'automático'}: ${archivados} archivos → Drive (${Math.round(bytesLiberados / 1024 / 1024)} MB liberados)`,
          usuario_id: user.id,
        })
      } catch {
        // El log de auditoría no es crítico — no falla el proceso si no puede registrarse
      }
    }

    const mbLiberados = Math.round(bytesLiberados / 1024 / 1024)
    return NextResponse.json({
      mensaje: archivados > 0
        ? `Archivado completado: ${archivados} archivo${archivados !== 1 ? 's' : ''}, ${mbLiberados} MB liberados de R2`
        : 'Sin archivos que mover — el almacenamiento está dentro del límite',
      archivados,
      bytesLiberados,
      errores,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error en archivado' },
      { status: 500 },
    )
  }
}
