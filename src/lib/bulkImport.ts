import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertMotoCliente } from '@/lib/clienteMoto'
import { normalizarPlaca } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'
import { registrarSalida } from '@/lib/movimientos'
import type { ResultadoImportacion, TarjetaPreview } from '@/components/ImportadorExcel'

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

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
  // Strip trailing decimal separator + 1-2 decimal digits (e.g. ".00", ",00") before removing separators
  // so "59500.00" becomes "59500" (→ 59500) and not "5950000" (→ 5,950,000)
  const str = String(s).trim().replace(/[.,]\d{1,2}$/, '')
  const n = parseInt(str.replace(/[^\d-]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function valorColumna(fila: Record<string, string>, ...posiblesCampos: string[]): string {
  for (const campo of posiblesCampos) {
    const v = fila[campo]
    if (v !== undefined && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

function agrupar(filas: Record<string, string>[], ...posiblesCampos: string[]): Map<string, Record<string, string>[]> {
  const grupos = new Map<string, Record<string, string>[]>()
  filas.forEach((fila) => {
    const key = valorColumna(fila, ...posiblesCampos)
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(fila)
  })
  return grupos
}

const ORIGENES_ST = ['uma', 'externo', 'mano_obra', 'insumo', 'lavado']
const ORIGENES_VENTA = ['uma', 'externo']
const ORIGENES_QUE_REQUIEREN_METODO_PAGO = ['externo', 'insumo', 'lavado']
const ESTADO_ALIASES: Record<string, string> = {
  en_proceso: 'en_proceso',
  pendiente: 'pendiente',
  pagado: 'pagado',
  finalizado: 'listo',
  listo: 'listo',
}

const ESTADO_LABEL: Record<string, string> = { en_proceso: 'En proceso', pendiente: 'Pendiente', pagado: 'Pagado', listo: 'Finalizado' }
const ESTADO_PAGO_LABEL: Record<string, string> = { pendiente: 'Pendiente', abono: 'Abono', pagado: 'Pagado' }

interface ItemPreparado { descripcion: string; origen: string; cantidad: number; costo: number; precio_venta: number; codigoUma: string; codigoExterno: string; proveedor: string; metodoPago: string }

interface LavaMotoConfig { costo: number; precioVenta: number }

interface GrupoOrdenPreparado {
  referencia: string
  filaIdxBase: number
  fechaISO: string
  cliente: string
  placa: string | null
  cedula: string | null
  celular: string | null
  estado: string
  items: ItemPreparado[]
  valorTotal: number
  montoPagado: number
  estadoPago: string
}

type ResultadoGrupo = { ok: true; grupo: GrupoOrdenPreparado } | { ok: false; mensaje: string }

function prepararGrupoOrden(referencia: string, grupoFilas: Record<string, string>[], filaIdxBase: number, tipoOrden: 'servicio' | 'venta_repuestos', lavaMotoConfig: LavaMotoConfig | null): ResultadoGrupo {
  const origenesValidos = tipoOrden === 'servicio' ? ORIGENES_ST : ORIGENES_VENTA
  const cab = grupoFilas[0]
  const fechaISO = parseFecha(valorColumna(cab, 'Fecha de la orden (DD/MM/AAAA)', 'Fecha de la venta (DD/MM/AAAA)', 'Fecha (DD/MM/AAAA)'))
  if (!fechaISO) return { ok: false, mensaje: 'fecha inválida, usa DD/MM/AAAA' }

  const cliente = String(cab['Cliente'] ?? '').trim()
  if (!cliente) return { ok: false, mensaje: 'falta el nombre del Cliente' }

  const placaRaw = String(cab['Placa'] ?? cab['Placa (opcional)'] ?? '').trim()
  const placa = placaRaw ? normalizarPlaca(placaRaw) : null
  if (tipoOrden === 'servicio' && !placa) return { ok: false, mensaje: 'falta la Placa' }

  const cedula = String(cab['Cedula'] ?? '').trim() || null
  const celular = String(cab['Celular'] ?? '').trim() || null

  let estado = 'listo'
  if (tipoOrden === 'servicio') {
    const estadoRaw = String(cab['Estado (en_proceso/pendiente/pagado/finalizado)'] ?? cab['Estado (en_proceso/pendiente/listo)'] ?? '').trim().toLowerCase()
    const estadoResuelto = ESTADO_ALIASES[estadoRaw]
    if (!estadoResuelto) return { ok: false, mensaje: 'falta el Estado o no es válido — usa en_proceso, pendiente, pagado o finalizado' }
    estado = estadoResuelto
  }

  // Validar items de este grupo (son opcionales: una Referencia sin ítems igual crea la orden/entrada para esa moto)
  const items: ItemPreparado[] = []
  let mensajeError: string | null = null
  grupoFilas.forEach((fila, i) => {
    if (mensajeError) return
    const descripcionRaw = String(fila['Descripcion del item'] ?? '').trim()
    const origen = String(fila['Origen (uma/externo/mano_obra/insumo/lavado)'] ?? fila['Origen (uma/externo/mano_obra/insumo)'] ?? fila['Origen (uma/externo)'] ?? '').trim().toLowerCase()
    if (!descripcionRaw && !origen) return // fila sin ítem (solo trae los datos de la orden), se ignora sin error
    if (!origenesValidos.includes(origen)) { mensajeError = `fila ${filaIdxBase + i}: Origen "${origen}" inválido — usa: ${origenesValidos.join(', ')}`; return }
    const descripcion = origen === 'lavado' ? (descripcionRaw || 'Lava Moto') : descripcionRaw
    if (!descripcion) { mensajeError = `fila ${filaIdxBase + i}: falta la Descripción del ítem`; return }
    const codigoUma = String(fila['Codigo UMA (si Origen=uma)'] ?? '').trim()
    if (origen === 'uma' && !codigoUma) { mensajeError = `fila ${filaIdxBase + i}: Origen "uma" requiere el Código UMA del catálogo`; return }
    const metodoPago = String(fila['Metodo de pago (obligatorio si Origen=externo, insumo o lavado)'] ?? fila['Metodo de pago'] ?? '').trim()
    if (ORIGENES_QUE_REQUIEREN_METODO_PAGO.includes(origen) && !metodoPago) { mensajeError = `fila ${filaIdxBase + i}: Origen "${origen}" requiere el Método de pago`; return }

    let costo: number
    let precio_venta: number
    if (origen === 'lavado') {
      if (!lavaMotoConfig) { mensajeError = `fila ${filaIdxBase + i}: el servicio de Lava Moto no está activo en Configuración — actívalo antes de importar este tipo de ítem`; return }
      costo = lavaMotoConfig.costo
      precio_venta = lavaMotoConfig.precioVenta
    } else {
      costo = parseNum(fila['Costo proveedor'])
      precio_venta = parseNum(fila['Precio de venta'])
    }

    items.push({
      descripcion, origen,
      cantidad: parseNum(fila['Cantidad']) || 1,
      costo, precio_venta,
      codigoUma,
      codigoExterno: String(fila['Codigo externo (opcional, si Origen=externo)'] ?? '').trim(),
      proveedor: String(fila['Proveedor (opcional, si Origen=externo)'] ?? '').trim(),
      metodoPago,
    })
  })
  if (mensajeError) return { ok: false, mensaje: mensajeError }

  const valorTotal = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const montoPagadoCol = cab['Monto pagado (solo en la primera fila de cada orden)'] ?? cab['Monto pagado (solo en la primera fila de cada venta)']
  const montoPagado = Math.min(parseNum(montoPagadoCol), valorTotal)
  const estadoPago = montoPagado <= 0 ? 'pendiente' : montoPagado >= valorTotal ? 'pagado' : 'abono'

  return { ok: true, grupo: { referencia, filaIdxBase, fechaISO, cliente, placa, cedula, celular, estado, items, valorTotal, montoPagado, estadoPago } }
}

async function cargarMetodosPagoSet(supabase: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const { data } = await supabase.from('metodos_pago').select('nombre').eq('tenant_id', tenantId)
  return new Set(((data ?? []) as { nombre: string }[]).map((r) => r.nombre.trim().toLowerCase()))
}

async function cargarLavaMotoConfig(supabase: SupabaseClient, tenantId: string): Promise<LavaMotoConfig | null> {
  const { data } = await supabase.from('lava_moto_config').select('costo, precio_venta, activo').eq('tenant_id', tenantId).maybeSingle()
  const config = data as { costo: number; precio_venta: number; activo: boolean } | null
  if (!config?.activo) return null
  return { costo: Number(config.costo), precioVenta: Number(config.precio_venta) }
}

async function previsualizarOrdenes(filas: Record<string, string>[], tipoOrden: 'servicio' | 'venta_repuestos', supabase: SupabaseClient, tenantId: string): Promise<TarjetaPreview[]> {
  const [metodosPagoSet, lavaMotoConfig] = await Promise.all([
    cargarMetodosPagoSet(supabase, tenantId),
    tipoOrden === 'servicio' ? cargarLavaMotoConfig(supabase, tenantId) : Promise.resolve(null),
  ])
  const grupos = agrupar(filas, 'Referencia (la inventas tú, ej: 1)', 'Referencia')
  const tarjetas: TarjetaPreview[] = []
  for (const [referencia, grupoFilas] of grupos) {
    const filaIdxBase = filas.indexOf(grupoFilas[0]) + 2
    if (!referencia) { tarjetas.push({ titulo: `Fila ${filaIdxBase}`, lineas: [], error: 'Falta la Referencia que agrupa las filas de la orden' }); continue }
    const resultado = prepararGrupoOrden(referencia, grupoFilas, filaIdxBase, tipoOrden, lavaMotoConfig)
    if (!resultado.ok) { tarjetas.push({ titulo: `Referencia ${referencia}`, lineas: [], error: resultado.mensaje }); continue }
    const g = resultado.grupo

    const metodoInvalido = g.items.find((it) => it.metodoPago && !metodosPagoSet.has(it.metodoPago.toLowerCase()))
    if (metodoInvalido) {
      tarjetas.push({ titulo: `Referencia ${referencia}`, lineas: [], error: `No se encontró el método de pago "${metodoInvalido.metodoPago}" — usa el nombre exacto (ej: Efectivo, Transferencia, Datafono)` })
      continue
    }

    const fechaLegible = new Date(g.fechaISO).toLocaleDateString('es-CO')
    const lineas: string[] = [`Fecha: ${fechaLegible}`]
    if (tipoOrden === 'servicio') lineas.push(`Estado: ${ESTADO_LABEL[g.estado] ?? g.estado}`)
    if (g.cedula) lineas.push(`Cédula: ${g.cedula}`)
    if (g.celular) lineas.push(`Celular: ${g.celular}`)
    if (g.items.length === 0) {
      lineas.push('Sin ítems — se crea la orden vacía, podrás agregarle repuestos/mano de obra después')
    } else {
      lineas.push(`Ítems (${g.items.length}):`)
      g.items.forEach((it) => {
        const detalleCosto = it.origen === 'uma' ? '' : ` · costo proveedor ${formatMoney(it.costo)}`
        const detalleMetodo = it.metodoPago ? ` · método ${it.metodoPago}` : ''
        lineas.push(`  • ${it.descripcion} (${it.origen}) x${it.cantidad} — venta ${formatMoney(it.precio_venta)}${detalleCosto}${detalleMetodo}`)
      })
    }
    lineas.push(`Total: ${formatMoney(g.valorTotal)}`)
    lineas.push(g.montoPagado > 0
      ? `Pago: ${formatMoney(g.montoPagado)} → queda como "${ESTADO_PAGO_LABEL[g.estadoPago] ?? g.estadoPago}"`
      : 'Pago: sin pago registrado (queda "Pendiente")')
    tarjetas.push({
      titulo: tipoOrden === 'servicio' ? `Orden — Placa ${g.placa} — ${g.cliente}` : `Venta — ${g.cliente}`,
      lineas,
    })
  }
  return tarjetas
}

export function previsualizarServicioTecnico(filas: Record<string, string>[], supabase: SupabaseClient, tenantId: string): Promise<TarjetaPreview[]> {
  return previsualizarOrdenes(filas, 'servicio', supabase, tenantId)
}

export function previsualizarVentaRepuestos(filas: Record<string, string>[], supabase: SupabaseClient, tenantId: string): Promise<TarjetaPreview[]> {
  return previsualizarOrdenes(filas, 'venta_repuestos', supabase, tenantId)
}

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
  const grupos = agrupar(filas, 'Referencia (la inventas tú, ej: 1)', 'Referencia')

  const [metodosPagoRows, lavaMotoConfig] = await Promise.all([
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId),
    tipoOrden === 'servicio' ? cargarLavaMotoConfig(supabase, tenantId) : Promise.resolve(null),
  ])
  const metodosPagoMap = new Map<string, string>(
    ((metodosPagoRows.data ?? []) as { id: string; nombre: string }[]).map((m) => [m.nombre.trim().toLowerCase(), m.id])
  )

  for (const [referencia, grupoFilas] of grupos) {
    const filaIdxBase = filas.indexOf(grupoFilas[0]) + 2 // +2: encabezado + 1-index
    if (!referencia) { errores.push({ fila: filaIdxBase, mensaje: 'Falta la Referencia que agrupa las filas de la orden' }); continue }

    const resultado = prepararGrupoOrden(referencia, grupoFilas, filaIdxBase, tipoOrden, lavaMotoConfig)
    if (!resultado.ok) { errores.push({ fila: filaIdxBase, mensaje: `Referencia ${referencia}: ${resultado.mensaje}` }); continue }
    const { fechaISO, cliente, placa, cedula, celular, estado, items: itemsValidados, valorTotal, montoPagado, estadoPago } = resultado.grupo

    try {
      const { motoId, clienteId } = await upsertMotoCliente({
        supabase, tenantId, placa, clienteNombre: cliente, cedula, celular,
      })

      // Resolver catálogo: UMA por código, Externo por código o nombre (se crea si no existe)
      const itemsResueltos: { descripcion: string; origen: string; cantidad: number; costo: number; precio_venta: number; repuesto_uma_id: string | null; repuesto_externo_id: string | null; metodo_pago_id: string | null }[] = []
      const lavadosResueltos: { cantidad: number; costoUnitario: number; precioVentaUnitario: number; metodoPagoId: string }[] = []
      for (const it of itemsValidados) {
        let metodoPagoId: string | null = null
        if (it.metodoPago) {
          metodoPagoId = metodosPagoMap.get(it.metodoPago.toLowerCase()) ?? null
          if (!metodoPagoId) throw new Error(`No se encontró el método de pago "${it.metodoPago}" — usa el nombre exacto (ej: Efectivo, Transferencia, Datafono)`)
        }

        if (it.origen === 'lavado') {
          lavadosResueltos.push({ cantidad: it.cantidad, costoUnitario: it.costo, precioVentaUnitario: it.precio_venta, metodoPagoId: metodoPagoId! })
          continue
        }

        let repuestoUmaId: string | null = null
        let repuestoExternoId: string | null = null
        let costoFinal = it.costo

        if (it.origen === 'uma') {
          const { data: umaRow } = await supabase
            .from('repuestos_uma').select('id')
            .eq('tenant_id', tenantId).eq('codigo', it.codigoUma).maybeSingle()
          if (!umaRow) throw new Error(`No se encontró el repuesto UMA con código "${it.codigoUma}"`)
          repuestoUmaId = (umaRow as { id: string }).id
          costoFinal = 0 // costo de UMA no se registra por ítem, igual que en el flujo manual
        } else if (it.origen === 'externo') {
          if (it.codigoExterno) {
            const { data: extRow } = await supabase
              .from('repuestos_externos').select('id, ultimo_costo')
              .eq('tenant_id', tenantId).eq('codigo', it.codigoExterno).maybeSingle()
            if (extRow) { repuestoExternoId = (extRow as { id: string }).id; costoFinal = (extRow as { ultimo_costo: number | null }).ultimo_costo ?? it.costo }
          }
          if (!repuestoExternoId) {
            const { data: extRow } = await supabase
              .from('repuestos_externos').select('id, ultimo_costo')
              .eq('tenant_id', tenantId).ilike('nombre', it.descripcion).maybeSingle()
            if (extRow) { repuestoExternoId = (extRow as { id: string }).id; costoFinal = (extRow as { ultimo_costo: number | null }).ultimo_costo ?? it.costo }
          }
          if (!repuestoExternoId) {
            let proveedorId: string | null = null
            if (it.proveedor) {
              const { data: provExistente } = await supabase
                .from('proveedores').select('id')
                .eq('tenant_id', tenantId).ilike('nombre', it.proveedor).maybeSingle()
              if (provExistente) proveedorId = (provExistente as { id: string }).id
              else {
                const { data: provNuevo } = await supabase.from('proveedores')
                  .insert({ tenant_id: tenantId, nombre: it.proveedor }).select('id').single()
                proveedorId = (provNuevo as { id: string } | null)?.id ?? null
              }
            }
            const { data: extNuevo, error: extErr } = await supabase.from('repuestos_externos').insert({
              tenant_id: tenantId, nombre: it.descripcion,
              ultimo_costo: it.costo, ultimo_precio_venta: it.precio_venta,
              proveedor_id: proveedorId, registrado_por: usuarioId,
            }).select('id').single()
            if (extErr || !extNuevo) throw new Error(`No se pudo crear el repuesto externo "${it.descripcion}": ${extErr?.message ?? ''}`)
            repuestoExternoId = (extNuevo as { id: string }).id
          }
        }

        itemsResueltos.push({
          descripcion: it.descripcion, origen: it.origen, cantidad: it.cantidad,
          costo: costoFinal, precio_venta: it.precio_venta,
          repuesto_uma_id: repuestoUmaId, repuesto_externo_id: repuestoExternoId,
          metodo_pago_id: metodoPagoId,
        })
      }

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

      let itemsInsertados: { id: string; repuesto_uma_id: string | null; repuesto_externo_id: string | null; cantidad: number; costo: number; precio_venta: number }[] = []
      if (itemsResueltos.length > 0) {
        const { data, error: itemsErr } = await supabase.from('items_orden').insert(
          itemsResueltos.map((it) => ({
            orden_id: orden.id,
            descripcion: it.descripcion,
            origen: it.origen,
            repuesto_uma_id: it.repuesto_uma_id,
            repuesto_externo_id: it.repuesto_externo_id,
            cantidad: it.cantidad,
            costo: it.costo,
            precio_venta: it.precio_venta,
            metodo_pago_id: it.metodo_pago_id,
            created_at: fechaISO,
          }))
        ).select('id, repuesto_uma_id, repuesto_externo_id, cantidad, costo, precio_venta')
        if (itemsErr) throw new Error(itemsErr.message)
        itemsInsertados = (data ?? []) as typeof itemsInsertados
      }

      await Promise.all(
        itemsInsertados.map((it) =>
          registrarSalida(supabase, tipoOrden === 'venta_repuestos' ? 'venta_directa' : 'uso_st', {
            tenantId,
            repuesto_uma_id: it.repuesto_uma_id,
            repuesto_externo_id: it.repuesto_externo_id,
            cantidad: it.cantidad,
            costo_unitario: it.costo,
            precio_unitario: it.precio_venta,
            orden_id: orden.id,
            item_orden_id: it.id,
            registrado_por: usuarioId,
            fecha: fechaISO,
          })
        )
      )

      if (lavadosResueltos.length > 0) {
        const { data: lavadosData, error: lavadosErr } = await supabase.from('lava_moto_ordenes').insert(
          lavadosResueltos.map((lm) => ({
            orden_id: orden.id,
            tenant_id: tenantId,
            cantidad: lm.cantidad,
            costo_unitario: lm.costoUnitario,
            precio_venta_unitario: lm.precioVentaUnitario,
            metodo_pago_id: lm.metodoPagoId,
            pago_costo_id: null,
            registrado_por: usuarioId,
            created_at: fechaISO,
          }))
        ).select('id')
        if (lavadosErr) throw new Error(lavadosErr.message)
        await Promise.all(
          ((lavadosData ?? []) as { id: string }[]).map((row) =>
            registrarAuditoria(supabase, {
              tenant_id: tenantId,
              tabla: 'lava_moto_ordenes',
              registro_id: row.id,
              tipo: 'movimiento',
              descripcion: `Servicio de lavado importado por carga masiva (Excel) — orden #${orden.numero}`,
              usuario_id: usuarioId,
            })
          )
        )
      }

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
const ETAPAS_VENTA = ['nuevo', 'con_interes', 'con_objecion', 'seguimiento', 'buscando_credito', 'calificado', 'demo', 'propuesta', 'negociacion', 'ganado', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada', 'perdido']
const ETAPA_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', con_interes: 'Con Interés', con_objecion: 'Con objeción', seguimiento: 'Seguimiento', buscando_credito: 'Buscando Crédito',
  calificado: 'Calificado', demo: 'Demo', propuesta: 'Propuesta', negociacion: 'Negociación',
  ganado: 'Ganado', en_matricula: 'En matrícula', alistamiento: 'Alistamiento', espera_entrega: 'Espera de entrega',
  entregada: 'Entregada', perdido: 'Perdido',
}

export function previsualizarSeguimientoVentas(filas: Record<string, string>[]): TarjetaPreview[] {
  return filas.map((fila, i) => {
    const filaIdx = i + 2
    const primerNombre = String(fila['Primer nombre'] ?? '').trim()
    const primerApellido = String(fila['Primer apellido'] ?? '').trim()
    if (!primerNombre || !primerApellido) {
      return { titulo: `Fila ${filaIdx}`, lineas: [], error: 'Faltan Primer nombre y/o Primer apellido' }
    }
    const segundoNombre = String(fila['Segundo nombre'] ?? '').trim()
    const segundoApellido = String(fila['Segundo apellido'] ?? '').trim()
    const nombre = [primerNombre, segundoNombre, primerApellido, segundoApellido].filter(Boolean).join(' ')

    const tipoDocRaw = String(fila['Tipo de documento (CC/TI/CE/PASAPORTE/NIT/RC/PEP)'] ?? '').trim().toUpperCase()
    const tipoDocumento = TIPOS_DOCUMENTO.includes(tipoDocRaw) ? tipoDocRaw : 'CC'
    const cedula = String(fila['Numero de documento'] ?? '').trim()
    const celular = String(fila['Celular'] ?? '').trim()
    const email = String(fila['Email'] ?? '').trim()
    const etapaRaw = String(fila['Etapa (nuevo/calificado/demo/propuesta/negociacion/ganado/en_matricula/alistamiento/espera_entrega/entregada/perdido)'] ?? '').trim().toLowerCase()
    const etapaVenta = ETAPAS_VENTA.includes(etapaRaw) ? etapaRaw : 'nuevo'
    const valorEstimado = parseNum(fila['Valor estimado de venta'])
    const proximaAccion = String(fila['Proxima accion'] ?? '').trim()
    const proximaAccionFecha = String(fila['Fecha proxima accion (DD/MM/AAAA)'] ?? '').trim()

    const lineas: string[] = []
    lineas.push(cedula ? `Documento: ${tipoDocumento} ${cedula}` : `Documento: ${tipoDocumento} (sin número)`)
    if (celular) lineas.push(`Celular: ${celular}`)
    if (email) lineas.push(`Email: ${email}`)
    lineas.push(`Etapa: ${ETAPA_LABEL[etapaVenta] ?? etapaVenta}`)
    if (valorEstimado > 0) lineas.push(`Valor estimado de venta: ${formatMoney(valorEstimado)}`)
    if (proximaAccion) lineas.push(`Próxima acción: ${proximaAccion}${proximaAccionFecha ? ` (${proximaAccionFecha})` : ''}`)
    lineas.push((cedula || celular) ? 'Si el documento o celular ya existen, se actualiza ese cliente en vez de crear uno nuevo.' : 'Se creará como cliente nuevo en Seguimiento Ventas.')

    return { titulo: nombre, lineas }
  })
}

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
