import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { renameDriveFolder } from '@/lib/drive'
import { dispararAutomatizacionesEtapa } from '@/lib/mensajeria/flow-executor'

const CAMPOS_NOMBRE = new Set(['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido', 'nombre', 'celular'])

function buildFolderName(nombre: string | null, celular: string | null): string {
  const n = (nombre ?? 'cliente').replace(/[<>:"/\\|?*]/g, '_').trim() || 'cliente'
  const c = (celular ?? '').replace(/\D/g, '')
  return c ? `${n} - ${c}` : n
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const { cliente_id, ...campos } = body as Record<string, unknown>
  if (!cliente_id)
    return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  if ('assigned_to' in campos && !esGerencia) {
    delete campos.assigned_to
  }
  if (!esGerencia) {
    delete campos.estado_aprobacion_matricula
    delete campos.aprobado_matricula_por
  }

  const admin = createAdminClient()

  const { data: clienteActual } = await admin
    .from('clientes')
    .select('id, fecha_cierre')
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!clienteActual) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Validar que la etapa exista de verdad para este tenant (ya no hay CHECK
  // constraint en la base de datos — las etapas son dinámicas por tenant desde
  // Config Ventas → Pipelines y Etapas, así que la validación vive acá).
  if (typeof campos.etapa_venta === 'string') {
    const { data: etapaRow } = await admin
      .from('etapas_pipeline')
      .select('orden, es_ganado, es_perdido')
      .eq('tenant_id', perfil.tenant_id)
      .eq('clave', campos.etapa_venta)
      .maybeSingle()
    if (!etapaRow) {
      return NextResponse.json({ error: `La etapa "${campos.etapa_venta}" no existe en este pipeline` }, { status: 400 })
    }
    campos.etapa_venta_orden = etapaRow.orden
    // fecha_cierre marca cuándo se vendió/perdió el cliente — la usan los
    // dashboards para filtrar por período. Se dispara una sola vez, al
    // entrar a la etapa ganada/perdida (nunca se sobreescribe después).
    if ((etapaRow.es_ganado || etapaRow.es_perdido) && !clienteActual.fecha_cierre) {
      campos.fecha_cierre = new Date().toISOString()
    }
  }

  const { error } = await admin
    .from('clientes')
    .update(campos)
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si cambió nombre o celular, renombrar carpeta en Drive (fire & forget)
  const afectaNombre = Object.keys(campos).some(k => CAMPOS_NOMBRE.has(k))
  if (afectaNombre) {
    renombrarCarpetaDrive(admin, cliente_id, perfil.tenant_id).catch(() => {})
  }

  // Si cambió la etapa, evaluar y arrancar las automatizaciones de pipeline que
  // apliquen (grupo "Automatizaciones" en Flujos) — corren en paralelo entre sí y
  // sin interferir con el flujo de mensajería que esté activo en la conversación.
  if (typeof campos.etapa_venta === 'string') {
    try {
      const { data: conv } = await admin
        .from('conversaciones')
        .select('id')
        .eq('cliente_id', cliente_id)
        .eq('tenant_id', perfil.tenant_id)
        .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (conv?.id) {
        await dispararAutomatizacionesEtapa(perfil.tenant_id, conv.id, cliente_id as string, campos.etapa_venta)
      }
    } catch (e) {
      console.error('[guardar] error al disparar automatizaciones de pipeline:', e)
    }
  }

  return NextResponse.json({ ok: true })
}

async function renombrarCarpetaDrive(
  admin: ReturnType<typeof createAdminClient>,
  clienteId: string,
  tenantId: string,
) {
  const [clienteRes, tenantRes] = await Promise.all([
    admin.from('clientes').select('nombre, celular, drive_folder_id').eq('id', clienteId).single(),
    admin.from('tenants').select('google_refresh_token').eq('id', tenantId).single(),
  ])

  const folderId      = clienteRes.data?.drive_folder_id
  const refreshToken  = tenantRes.data?.google_refresh_token

  if (!folderId || !refreshToken) return

  const nuevoNombre = buildFolderName(clienteRes.data?.nombre ?? null, clienteRes.data?.celular ?? null)
  await renameDriveFolder(folderId, nuevoNombre, refreshToken)
}
