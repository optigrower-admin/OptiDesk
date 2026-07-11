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

  // 3. Buscar por celular
  if (celular) {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('celular', celular)
      .maybeSingle()
    if (data) return { cliente: await rellenarCamposVacios(supabase, data, params), creado: false }
  }

  // 4. Crear nuevo registro único
  const nuevo: Record<string, string> = {
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

  let { data: creado, error } = await supabase
    .from('clientes')
    .insert(nuevo)
    .select('*')
    .single()

  // Si la migración de tipo_documento no se ha corrido todavía en esta base,
  // no se debe bloquear la creación del cliente por esa sola columna.
  if (error?.code === '42703' && 'tipo_documento' in nuevo) {
    delete nuevo.tipo_documento
    ;({ data: creado, error } = await supabase.from('clientes').insert(nuevo).select('*').single())
  }

  if (error) throw new Error(error.message)

  return { cliente: creado, creado: true }
}
