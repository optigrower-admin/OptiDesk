import { createAdminClient } from '@/lib/supabase/admin'

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
}

export async function buscarOCrearCliente(params: BuscarCrearParams) {
  const supabase = createAdminClient()
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
    if (data) return { cliente: data, creado: false }
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
      if (data) return { cliente: data, creado: false }
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
    if (data) return { cliente: data, creado: false }
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

  const { data: creado, error } = await supabase
    .from('clientes')
    .insert(nuevo)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return { cliente: creado, creado: true }
}
