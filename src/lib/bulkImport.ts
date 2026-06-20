import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertMotoCliente } from '@/lib/clienteMoto'
import { normalizarPlaca } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'
import type { ResultadoImportacion } from '@/components/ImportadorExcel'

function parseFecha(s: string): string | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  const dia = parseInt(d, 10), mes = parseInt(mo, 10), anio = parseInt(y, 10)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const fecha = new Date(anio, mes - 1, dia, 12, 0, 0)
  return fecha.toISOString()
}

function parseNum(s: string | undefined): number {
  if (!s) return 0
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function agrupar(filas: Record<string, string>[], campo: string): Map<string, Record<string, string>[]> {
  const grupos = new Map<string, Record<string, string>[]>()
  filas.forEach((fila) => {
    const key = String(fila[campo] ?? '').trim()
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(fila)
  })
  return grupos
}

const ORIGENES_ST = ['uma', 'externo', 'mano_obra', 'insumo']
const ORIGENES_VENTA = ['uma', 'externo']
const ESTADOS_ORDEN = ['en_proceso', 'pendiente', 'listo']

interface ImportarOrdenesParams {
  supabase: SupabaseClient
  tenantId: string
  usuarioId: string
  filas: Record<string, string>[]
  tipoOrden: 'servicio' | 'venta_repuestos'
}

async function importarOrdenesMultiFila({ supabase, tenantId, usuarioId, filas, tipoOrden }: ImportarOrdenesParams): Promise<ResultadoImportacion> {
  const errores: { fila: number; mensaje: string }[] = []
  let exitosos = 0
  const grupos = agrupar(filas, 'Referencia')
  const origenesValidos = tipoOrden === 'servicio' ? ORIGENES_ST : ORIGENES_VENTA

  for (const [referencia, grupoFilas] of grupos) {
    const filaIdxBase = filas.indexOf(grupoFilas[0]) + 2 // +2: encabezado + 1-index
    if (!referencia) { errores.push({ fila: filaIdxBase, mensaje: 'Falta la Referencia que agrupa las filas de la orden' }); continue }

    const cab = grupoFilas[0]
    const fechaISO = parseFecha(cab['Fecha (DD/MM/AAAA)'])
    if (!fechaISO) { errores.push({ fila: filaIdxBase, mensaje: `Referencia ${referencia}: fecha inválida, usa DD/MM/AAAA` }); continue }

    const cliente = String(cab['Cliente'] ?? '').trim()
    if (!cliente) { errores.push({ fila: filaIdxBase, mensaje: `Referencia ${referencia}: falta el nombre del Cliente` }); continue }

    const placaRaw = String(cab['Placa'] ?? cab['Placa (opcional)'] ?? '').trim()
    const placa = placaRaw ? normalizarPlaca(placaRaw) : null
    if (tipoOrden === 'servicio' && !placa) { errores.push({ fila: filaIdxBase, mensaje: `Referencia ${referencia}: falta la Placa` }); continue }

    const cedula = String(cab['Cedula'] ?? '').trim() || null
    const celular = String(cab['Celular'] ?? '').trim() || null

    // Validar items de este grupo
    const itemsValidados: { descripcion: string; origen: string; cantidad: number; costo: number; precio_venta: number }[] = []
    let filaError = false
    grupoFilas.forEach((fila, i) => {
      const descripcion = String(fila['Descripcion del item'] ?? '').trim()
      const origen = String(fila['Origen (uma/externo/mano_obra/insumo)'] ?? fila['Origen (uma/externo)'] ?? '').trim().toLowerCase()
      if (!descripcion) { errores.push({ fila: filaIdxBase + i, mensaje: 'Falta la Descripción del ítem' }); filaError = true; return }
      if (!origenesValidos.includes(origen)) { errores.push({ fila: filaIdxBase + i, mensaje: `Origen "${origen}" inválido — usa: ${origenesValidos.join(', ')}` }); filaError = true; return }
      const precio_venta = parseNum(fila['Precio de venta'])
      itemsValidados.push({
        descripcion, origen,
        cantidad: parseNum(fila['Cantidad']) || 1,
        costo: parseNum(fila['Costo proveedor']),
        precio_venta,
      })
    })
    if (filaError || itemsValidados.length === 0) continue

    try {
      const { motoId, clienteId } = await upsertMotoCliente({
        supabase, tenantId, placa, clienteNombre: cliente, cedula, celular,
      })

      const valorTotal = itemsValidados.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      const montoPagadoCol = cab['Monto pagado (solo en la primera fila de cada orden)'] ?? cab['Monto pagado (solo en la primera fila de cada venta)']
      const montoPagado = Math.min(parseNum(montoPagadoCol), valorTotal)
      const estadoPago = montoPagado <= 0 ? 'pendiente' : montoPagado >= valorTotal ? 'pagado' : 'abono'
      const estadoOrdenRaw = String(cab['Estado (en_proceso/pendiente/listo)'] ?? '').trim().toLowerCase()
      const estado = tipoOrden === 'venta_repuestos' ? 'listo' : (ESTADOS_ORDEN.includes(estadoOrdenRaw) ? estadoOrdenRaw : 'listo')

      const { data: ordenData, error: ordenErr } = await supabase
        .from('ordenes')
        .insert({
          tenant_id: tenantId,
          placa: placa ?? 'SIN-PLACA',
          cliente, cedula, celular,
          tipo_orden: tipoOrden,
          estado,
          estado_pago: estadoPago,
          valor_total: valorTotal,
          valor_abono: montoPagado,
          numero: 0,
          moto_id: motoId,
          cliente_id: clienteId,
          created_at: fechaISO,
        })
        .select('id, numero')
        .single()
      if (ordenErr || !ordenData) throw new Error(ordenErr?.message ?? 'No se pudo crear la orden')
      const orden = ordenData as { id: string; numero: number }

      const { error: itemsErr } = await supabase.from('items_orden').insert(
        itemsValidados.map((it) => ({
          orden_id: orden.id,
          descripcion: it.descripcion,
          origen: it.origen,
          cantidad: it.cantidad,
          costo: it.costo,
          precio_venta: it.precio_venta,
          created_at: fechaISO,
        }))
      )
      if (itemsErr) throw new Error(itemsErr.message)

      if (montoPagado > 0) {
        await supabase.from('pagos_orden').insert({
          orden_id: orden.id,
          tenant_id: tenantId,
          monto: montoPagado,
          notas: 'Importado desde Excel',
          registrado_por: usuarioId,
          fecha: fechaISO,
        })
      }

      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'ordenes',
        registro_id: orden.id,
        tipo: 'movimiento',
        descripcion: `Orden #${orden.numero} creada por importación masiva (Excel) — ${cliente}`,
        usuario_id: usuarioId,
      })

      exitosos++
    } catch (e: unknown) {
      errores.push({ fila: filaIdxBase, mensaje: `Referencia ${referencia}: ${e instanceof Error ? e.message : 'error al guardar'}` })
    }
  }

  return { exitosos, errores }
}

export async function importarServicioTecnico(supabase: SupabaseClient, tenantId: string, usuarioId: string, filas: Record<string, string>[]): Promise<ResultadoImportacion> {
  return importarOrdenesMultiFila({ supabase, tenantId, usuarioId, filas, tipoOrden: 'servicio' })
}

export async function importarVentaRepuestos(supabase: SupabaseClient, tenantId: string, usuarioId: string, filas: Record<string, string>[]): Promise<ResultadoImportacion> {
  return importarOrdenesMultiFila({ supabase, tenantId, usuarioId, filas, tipoOrden: 'venta_repuestos' })
}

const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'PASAPORTE', 'NIT', 'RC', 'PEP']
const ETAPAS_VENTA = ['nuevo', 'calificado', 'demo', 'propuesta', 'negociacion', 'ganado', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada', 'perdido']

export async function importarSeguimientoVentas(supabase: SupabaseClient, tenantId: string, usuarioId: string, filas: Record<string, string>[]): Promise<ResultadoImportacion> {
  const errores: { fila: number; mensaje: string }[] = []
  let exitosos = 0

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    const filaIdx = i + 2
    const primerNombre = String(fila['Primer nombre'] ?? '').trim()
    const primerApellido = String(fila['Primer apellido'] ?? '').trim()
    if (!primerNombre || !primerApellido) { errores.push({ fila: filaIdx, mensaje: 'Faltan Primer nombre y/o Primer apellido' }); continue }

    const segundoNombre = String(fila['Segundo nombre'] ?? '').trim()
    const segundoApellido = String(fila['Segundo apellido'] ?? '').trim()
    const nombre = [primerNombre, segundoNombre, primerApellido, segundoApellido].filter(Boolean).join(' ')

    const tipoDocRaw = String(fila['Tipo de documento (CC/TI/CE/PASAPORTE/NIT/RC/PEP)'] ?? '').trim().toUpperCase()
    const tipoDocumento = TIPOS_DOCUMENTO.includes(tipoDocRaw) ? tipoDocRaw : 'CC'
    const cedula = String(fila['Numero de documento'] ?? '').trim() || null
    const celular = String(fila['Celular'] ?? '').trim() || null
    const email = String(fila['Email'] ?? '').trim() || null

    const etapaRaw = String(fila['Etapa (nuevo/calificado/demo/propuesta/negociacion/ganado/en_matricula/alistamiento/espera_entrega/entregada/perdido)'] ?? '').trim().toLowerCase()
    const etapaVenta = ETAPAS_VENTA.includes(etapaRaw) ? etapaRaw : 'nuevo'
    const valorEstimado = parseNum(fila['Valor estimado de venta']) || null
    const proximaAccion = String(fila['Proxima accion'] ?? '').trim() || null
    const proximaAccionFechaISO = parseFecha(fila['Fecha proxima accion (DD/MM/AAAA)'])

    const fechaCreacion = parseFecha(fila['Fecha (DD/MM/AAAA)'])

    try {
      let clienteId: string | null = null
      if (cedula) {
        const { data: existente } = await supabase.from('clientes').select('id').eq('tenant_id', tenantId).eq('cedula', cedula).maybeSingle()
        clienteId = (existente as { id: string } | null)?.id ?? null
      }
      if (!clienteId && celular) {
        const { data: existente } = await supabase.from('clientes').select('id').eq('tenant_id', tenantId).eq('celular', celular).maybeSingle()
        clienteId = (existente as { id: string } | null)?.id ?? null
      }

      const datosCliente = {
        nombre, primer_nombre: primerNombre, segundo_nombre: segundoNombre || null,
        primer_apellido: primerApellido, segundo_apellido: segundoApellido || null,
        tipo_documento: tipoDocumento, cedula, celular, email,
        en_seguimiento_ventas: true,
        etapa_venta: etapaVenta,
        valor_estimado_venta: valorEstimado,
        proxima_accion: proximaAccion,
        proxima_accion_fecha: proximaAccionFechaISO,
      }

      if (clienteId) {
        const { error } = await supabase.from('clientes').update(datosCliente).eq('id', clienteId)
        if (error) throw new Error(error.message)
      } else {
        const { data: nuevo, error } = await supabase.from('clientes').insert({
          tenant_id: tenantId,
          ...datosCliente,
          ...(fechaCreacion ? { created_at: fechaCreacion } : {}),
        }).select('id').single()
        if (error) throw new Error(error.message)
        clienteId = (nuevo as { id: string }).id
      }

      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'clientes',
        registro_id: clienteId!,
        tipo: 'movimiento',
        descripcion: `Cliente "${nombre}" importado/actualizado por carga masiva (Excel) en Seguimiento Ventas`,
        usuario_id: usuarioId,
      })

      exitosos++
    } catch (e: unknown) {
      errores.push({ fila: filaIdx, mensaje: e instanceof Error ? e.message : 'error al guardar' })
    }
  }

  return { exitosos, errores }
}
