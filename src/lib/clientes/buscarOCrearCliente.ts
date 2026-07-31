import { createAdminClient } from '@/lib/supabase/admin'
import { SupabaseClient } from '@supabase/supabase-js'

type CanalContacto = 'whatsapp' | 'messenger' | 'instagram' | 'telefono' | 'presencial'

interface BuscarCrearParams {
  tenantId: string
  canal?: CanalContacto
  contactId?: string
  celular?: string
  cedula?: string
  nombre?: string
  primerNombre?: string
  segundoNombre?: string
  primerApellido?: string
  segundoApellido?: string
  tipoDocumento?: string
  email?: string
  assignedTo?: string
  // Campos de seguimiento para incluir directo en el INSERT (evita race condition con UPDATE posterior)
  enSeguimientoVentas?: boolean
  etapaVenta?: string
  etapaVentaOrden?: number
  nombrePendienteAprobacion?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: SupabaseClient<any, any, any>
}

// Actualiza campos vacíos en un cliente existente con datos frescos del canal
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rellenarCamposVacios(supabase: SupabaseClient<any, any, any>, existente: Record<string, unknown>, params: BuscarCrearParams) {
  const { canal, contactId, celular, nombre } = params
  const updates: Record<string, string> = {}

  if (celular && !existente.celular)
    updates.celular = celular
  if (nombre && nombre !== 'Contacto nuevo' && (!existente.nombre || existente.nombre === 'Contacto nuevo'))
    updates.nombre = nombre
  if (canal === 'whatsapp'  && contactId && !existente.whatsapp_number) updates.whatsapp_number = contactId
  if (canal === 'messenger' && contactId && !existente.messenger_id)    updates.messenger_id    = contactId
  if (canal === 'instagram' && contactId && !existente.instagram_id)    updates.instagram_id    = contactId

  if (Object.keys(updates).length === 0) return existente
  const { data: actualizado } = await supabase.from('clientes').update(updates).eq('id', existente.id as string).select('*').single()
  return actualizado ?? existente
}

export async function buscarOCrearCliente(params: BuscarCrearParams) {
  // Usar el cliente inyectado si está disponible (para evitar re-crear el cliente en contextos donde ya existe)
  const supabase = params.supabaseClient ?? createAdminClient()
  const {
    tenantId, canal, contactId, celular, cedula, nombre,
    primerNombre, segundoNombre, primerApellido, segundoApellido,
    tipoDocumento, email, assignedTo,
    enSeguimientoVentas, etapaVenta, etapaVentaOrden, nombrePendienteAprobacion,
  } = params

  // 1. Buscar por cédula (identificador más fuerte)
  if (cedula) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('cedula', cedula)
      .maybeSingle()
    if (data) return { cliente: await rellenarCamposVacios(supabase, data, params), creado: false }
  }

  // 2. Buscar por canal (whatsapp_number, messenger_id, instagram_id)
  if (canal && contactId) {
    const campo =
      canal === 'whatsapp'  ? 'whatsapp_number' :
      canal === 'messenger' ? 'messenger_id'     :
      canal === 'instagram' ? 'instagram_id'     : null
    if (campo) {
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq(campo, contactId)
        .maybeSingle()
      if (data) return { cliente: await rellenarCamposVacios(supabase, data, params), creado: false }
    }
  }

  // 3. Buscar por celular (con normalización de prefijo Colombia 57XXXXXXXXXX ↔ 3XXXXXXXXX)
  // Solo busca clientes activos (en_seguimiento_ventas = true) para evitar
  // que un cliente archivado bloquee la creación de uno nuevo al re-contactar.
  if (celular) {
    const { data } = await supabase
      .from('clientes').select('*').eq('tenant_id', tenantId).eq('celular', celular).eq('en_seguimiento_ventas', true).maybeSingle()
    if (data) return { cliente: await rellenarCamposVacios(supabase, data, params), creado: false }

    // WhatsApp envía con código de país (573001234567), DB suele guardar sin él (3001234567)
    if (/^57\d{10}$/.test(celular)) {
      const sinPrefijo = celular.slice(2)
      const { data: d2 } = await supabase
        .from('clientes').select('*').eq('tenant_id', tenantId).eq('celular', sinPrefijo).eq('en_seguimiento_ventas', true).maybeSingle()
      if (d2) return { cliente: await rellenarCamposVacios(supabase, d2, params), creado: false }
    }
    // Inverso: guardado con prefijo pero llega sin él
    if (/^3\d{9}$/.test(celular)) {
      const conPrefijo = `57${celular}`
      const { data: d2 } = await supabase
        .from('clientes').select('*').eq('tenant_id', tenantId).eq('celular', conPrefijo).eq('en_seguimiento_ventas', true).maybeSingle()
      if (d2) return { cliente: await rellenarCamposVacios(supabase, d2, params), creado: false }
    }
  }

  // 4. Crear nuevo registro único
  const nuevo: Record<string, string | boolean | number> = {
    tenant_id: tenantId,
    nombre: nombre || 'Contacto nuevo',
  }
  if (celular)        nuevo.celular         = celular
  if (cedula)          nuevo.cedula          = cedula
  if (primerNombre)    nuevo.primer_nombre   = primerNombre
  if (segundoNombre)   nuevo.segundo_nombre  = segundoNombre
  if (primerApellido)  nuevo.primer_apellido = primerApellido
  if (segundoApellido) nuevo.segundo_apellido = segundoApellido
  if (tipoDocumento)   nuevo.tipo_documento  = tipoDocumento
  if (email)           nuevo.email           = email
  if (assignedTo)       nuevo.assigned_to     = assignedTo
  if (canal === 'whatsapp'  && contactId) nuevo.whatsapp_number = contactId
  if (canal === 'messenger' && contactId) nuevo.messenger_id    = contactId
  if (canal === 'instagram' && contactId) nuevo.instagram_id    = contactId
  // Campos de seguimiento: incluirlos en el INSERT para que el Realtime INSERT ya los tenga correctos
  if (enSeguimientoVentas !== undefined) nuevo.en_seguimiento_ventas = enSeguimientoVentas
  if (etapaVenta)                        nuevo.etapa_venta           = etapaVenta
  if (etapaVentaOrden !== undefined)     nuevo.etapa_venta_orden     = etapaVentaOrden
  if (nombrePendienteAprobacion !== undefined) nuevo.nombre_pendiente_aprobacion = nombrePendienteAprobacion

  let { data: creado, error } = await supabase
    .from('clientes')
    .insert(nuevo)
    .select('*')
    .single()

  // Fallback: columna tipo_documento no existe aún
  if (error?.code === '42703' && 'tipo_documento' in nuevo) {
    delete nuevo.tipo_documento
    ;({ data: creado, error } = await supabase.from('clientes').insert(nuevo).select('*').single())
  }

  // Fallback: columna nombre_pendiente_aprobacion no existe aún (migration_v72 pendiente)
  if (error?.code === '42703' && 'nombre_pendiente_aprobacion' in nuevo) {
    delete nuevo.nombre_pendiente_aprobacion
    ;({ data: creado, error } = await supabase.from('clientes').insert(nuevo).select('*').single())
  }

  // Fallback: CHECK constraint no incluye 'nuevo_mensaje' (migration_v74/v81 pendiente)
  if (error?.code === '23514' && nuevo.etapa_venta === 'nuevo_mensaje') {
    nuevo.etapa_venta       = 'nuevo'
    nuevo.etapa_venta_orden = 0
    ;({ data: creado, error } = await supabase.from('clientes').insert(nuevo).select('*').single())
  }

  if (error) throw new Error(error.message)

  import('@/lib/webhooks/disparar').then(({ dispararWebhook }) =>
    dispararWebhook(tenantId, 'lead.creado', { id: creado?.id, nombre: creado?.nombre, celular: creado?.celular, canal }),
  ).catch(() => {})

  return { cliente: creado, creado: true }
}
