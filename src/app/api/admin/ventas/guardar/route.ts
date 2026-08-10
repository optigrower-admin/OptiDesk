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
    delete campos.revision_perdida
    delete campos.revisado_perdida_por
    delete campos.revisado_perdida_at
  }
  // Solo gerencia/dueño puede marcar la revisión de un cliente perdido como
  // completada, y siempre queda registrado quién y cuándo la hizo.
  if (esGerencia && campos.revision_perdida === 'revisado') {
    campos.revisado_perdida_por = perfil.id
    campos.revisado_perdida_at = new Date().toISOString()
  }

  const admin = createAdminClient()

  const { data: clienteActual } = await admin
    .from('clientes')
    .select('id, fecha_cierre, fecha_matricula, revision_perdida')
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
      .select('orden, es_ganado, es_perdido, es_matricula, pipeline_id')
      .eq('tenant_id', perfil.tenant_id)
      .eq('clave', campos.etapa_venta)
      .maybeSingle()
    if (!etapaRow) {
      return NextResponse.json({ error: `La etapa "${campos.etapa_venta}" no existe en este pipeline` }, { status: 400 })
    }
    campos.etapa_venta_orden = etapaRow.orden

    const { data: etapaGanado } = await admin
      .from('etapas_pipeline')
      .select('orden')
      .eq('tenant_id', perfil.tenant_id)
      .eq('pipeline_id', etapaRow.pipeline_id)
      .eq('es_ganado', true)
      .maybeSingle()

    // Al llegar a Vendida/Carta Aprobación (o cualquier etapa posterior) el
    // cliente debe tener un vehículo seleccionado en "Motos de interés" —
    // ese vehículo es el que después se descuenta del Inventario de motos.
    if (etapaGanado && etapaRow.orden >= etapaGanado.orden && !etapaRow.es_perdido) {
      const { count: motosSeleccionadas } = await admin
        .from('clientes_motos_interes')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', cliente_id)
      if (!motosSeleccionadas) {
        return NextResponse.json(
          { error: 'Antes de marcar al cliente como Vendida/Carta Aprobación debes seleccionar el vehículo en la pestaña "Motos de interés".' },
          { status: 400 },
        )
      }
    }

    // fecha_cierre marca cuándo se vendió/perdió el cliente — la usan los
    // dashboards para filtrar por período. Se dispara una sola vez, al
    // entrar a la etapa ganada/perdida (nunca se sobreescribe al seguir
    // avanzando después, ej. de "Vendida" a "En matrícula").
    if (etapaRow.es_ganado || etapaRow.es_perdido) {
      if (!clienteActual.fecha_cierre) campos.fecha_cierre = new Date().toISOString()
    } else if (clienteActual.fecha_cierre) {
      // Si lo devuelven por debajo del punto "vendida" del pipeline (una
      // corrección real, no solo seguir avanzando más allá de vendida), se
      // limpia la fecha — como si nunca se hubiera marcado vendido, para
      // que no quede una fecha vieja confundiendo si se vuelve a vender.
      if (etapaGanado && etapaRow.orden < etapaGanado.orden) {
        campos.fecha_cierre = null
      }
    }
    // Al entrar por primera vez a "perdido" queda pendiente de revisión por
    // gerencia/dueño; si ya se había revisado y se vuelve a perder, se pide
    // revisar de nuevo.
    if (etapaRow.es_perdido) {
      if (!clienteActual.fecha_cierre || clienteActual.revision_perdida === 'revisado') {
        campos.revision_perdida = 'falta_revision'
        campos.revisado_perdida_por = null
        campos.revisado_perdida_at = null
      }
    }
    // fecha_matricula sigue el mismo patrón, para la etapa marcada es_matricula.
    if (etapaRow.es_matricula) {
      if (!clienteActual.fecha_matricula) campos.fecha_matricula = new Date().toISOString()
    } else if (clienteActual.fecha_matricula) {
      const { data: etapaMatricula } = await admin
        .from('etapas_pipeline')
        .select('orden')
        .eq('tenant_id', perfil.tenant_id)
        .eq('pipeline_id', etapaRow.pipeline_id)
        .eq('es_matricula', true)
        .maybeSingle()
      if (etapaMatricula && etapaRow.orden < etapaMatricula.orden) {
        campos.fecha_matricula = null
      }
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
