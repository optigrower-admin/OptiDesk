import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// Convierte JS Date a número serial de Excel (mismo sistema que la plantilla)
function toExcelDate(isoString: string): number {
  const d = new Date(isoString)
  return Math.round(d.getTime() / 86400000 + 25569)
}

// Extrae el código de referencia del campo descripcion "CODE - nombre"
function extraerCodigo(descripcion: string): string {
  const sep = descripcion.indexOf(' - ')
  return sep > 0 ? descripcion.slice(0, sep) : descripcion
}

interface ItemOrdenRow {
  id: string
  descripcion: string
  precio_venta: number
  cantidad: number
  created_at: string
  ordenes: {
    id: string
    numero: string | null
    placa: string | null
    cliente: string | null
    tipo_orden: string
    created_at: string
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()

  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

  const tenantId: string = perfil.tenant_id
  const body = await req.json()
  const {
    fechaInicio,
    fechaFin,
    consecutivoInicial,
    modoTercero,
  }: {
    fechaInicio: string
    fechaFin: string
    consecutivoInicial: number
    modoTercero: 'consumidor_final' | 'id_consumidores'
  } = body

  if (!fechaInicio || !fechaFin) {
    return NextResponse.json({ error: 'Faltan fechas' }, { status: 400 })
  }

  // Convertir fechas al rango completo del día (UTC)
  const desdeISO = fechaInicio + 'T00:00:00.000Z'
  const hastaISO = fechaFin + 'T23:59:59.999Z'

  // Traer items UMA de órdenes de servicio
  const { data: itemsServicio, error: e1 } = await supabase
    .from('items_orden')
    .select('id, descripcion, precio_venta, cantidad, created_at, ordenes!inner(id, numero, placa, cliente, tipo_orden, created_at, tenant_id)')
    .eq('origen', 'uma')
    .eq('ordenes.tenant_id', tenantId)
    .eq('ordenes.tipo_orden', 'servicio')
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO)
    .order('created_at')

  // Traer items UMA de ventas directas de repuestos
  const { data: itemsVenta, error: e2 } = await supabase
    .from('items_orden')
    .select('id, descripcion, precio_venta, cantidad, created_at, ordenes!inner(id, numero, placa, cliente, tipo_orden, created_at, tenant_id)')
    .eq('origen', 'uma')
    .eq('ordenes.tenant_id', tenantId)
    .eq('ordenes.tipo_orden', 'venta_repuestos')
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO)
    .order('created_at')

  if (e1 || e2) {
    return NextResponse.json({ error: `Error BD: ${e1?.message ?? e2?.message}` }, { status: 500 })
  }

  const todosItems: ItemOrdenRow[] = [
    ...((itemsServicio ?? []) as unknown as ItemOrdenRow[]),
    ...((itemsVenta ?? []) as unknown as ItemOrdenRow[]),
  ]

  // Ordenar por fecha de la orden para que el consecutivo sea cronológico
  todosItems.sort((a, b) =>
    new Date(a.ordenes.created_at).getTime() - new Date(b.ordenes.created_at).getTime()
  )

  // Asignar consecutivo por orden (mismo orden_id → mismo consecutivo)
  const ordenConsecutivo = new Map<string, number>()
  let nextConsec = Number(consecutivoInicial) || 1
  for (const item of todosItems) {
    const ordenId = item.ordenes.id
    if (!ordenConsecutivo.has(ordenId)) {
      ordenConsecutivo.set(ordenId, nextConsec++)
    }
  }

  // Mapa placa → cedula (solo para modo id_consumidores)
  const placaCedula = new Map<string, string>()
  if (modoTercero === 'id_consumidores') {
    const placas = [...new Set(todosItems.map(i => i.ordenes.placa).filter(Boolean))] as string[]
    if (placas.length > 0) {
      const { data: motos } = await supabase
        .from('motos')
        .select('placa, cliente_id')
        .eq('tenant_id', tenantId)
        .in('placa', placas)

      const clienteIds = [...new Set((motos ?? []).map((m: { cliente_id: string | null }) => m.cliente_id).filter(Boolean))] as string[]
      if (clienteIds.length > 0) {
        const { data: clientes } = await supabase
          .from('clientes')
          .select('id, cedula')
          .in('id', clienteIds)

        const clienteCedula = new Map<string, string>()
        for (const c of (clientes ?? []) as { id: string; cedula: string | null }[]) {
          if (c.cedula) clienteCedula.set(c.id, c.cedula)
        }

        for (const m of (motos ?? []) as { placa: string; cliente_id: string | null }[]) {
          if (m.placa && m.cliente_id) {
            const ced = clienteCedula.get(m.cliente_id)
            if (ced) placaCedula.set(m.placa, ced)
          }
        }
      }
    }
  }

  // Construir filas para el Excel (57 columnas A–BE)
  const COLS = 57 // A=0 ... BE=56
  const headers: string[] = [
    'Encab: Empresa', 'Encab: Tipo Documento', 'Encab: Prefijo', 'Encab: Documento Número',
    'Encab: Fecha', 'Encab: Tercero Interno', 'Encab: Tercero Externo', 'Encab: Nota',
    'Encab: FormaPago', 'Encab: Fecha Entrega', 'Encab: Prefijo Documento Externo',
    'Encab: Número_Documento_Externo', 'Encab: Verificado', 'Encab: Anulado',
    'Encab: Personalizado 1', 'Encab: Personalizado 2', 'Encab: Personalizado 3',
    'Encab: Personalizado 4', 'Encab: Personalizado 5', 'Encab: Personalizado 6',
    'Encab: Personalizado 7', 'Encab: Personalizado 8', 'Encab: Personalizado 9',
    'Encab: Personalizado 10', 'Encab: Personalizado 11', 'Encab: Personalizado 12',
    'Encab: Personalizado 13', 'Encab: Personalizado 14', 'Encab: Personalizado 15',
    'Encab: Sucursal', 'Encab: Clasificación',
    'Detalle: Producto', 'Detalle: Bodega', 'Detalle: UnidadDeMedida', 'Detalle: Cantidad',
    'Detalle: IVA', 'Detalle: Valor Unitario', 'Detalle: Descuento', 'Detalle: Vencimiento',
    'Detalle: Nota', 'Detalle: Centro costos',
    'Detalle: Personalizado1', 'Detalle: Personalizado2', 'Detalle: Personalizado3',
    'Detalle: Personalizado4', 'Detalle: Personalizado5', 'Detalle: Personalizado6',
    'Detalle: Personalizado7', 'Detalle: Personalizado8', 'Detalle: Personalizado9',
    'Detalle: Personalizado10', 'Detalle: Personalizado11', 'Detalle: Personalizado12',
    'Detalle: Personalizado13', 'Detalle: Personalizado14', 'Detalle: Personalizado15',
    'Detalle: Código Centro Costos',
  ]

  const ws: XLSX.WorkSheet = {}
  const range = { s: { r: 0, c: 0 }, e: { r: todosItems.length, c: COLS - 1 } }

  // Fila 0: cabeceras
  headers.forEach((h, ci) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { t: 's', v: h }
  })

  // Filas de datos
  todosItems.forEach((item, ri) => {
    const r = ri + 1
    const orden = item.ordenes
    const consec = ordenConsecutivo.get(orden.id) ?? nextConsec
    const excelDate = toExcelDate(orden.created_at)
    const refCode = extraerCodigo(item.descripcion)

    let terceroInterno: string
    if (modoTercero === 'consumidor_final') {
      terceroInterno = '222222222'
    } else {
      terceroInterno = (orden.placa ? placaCedula.get(orden.placa) : undefined) ?? '222222222'
    }

    const row: (string | number | null)[] = new Array(COLS).fill(null)
    row[0]  = 'MOTOSPACE38 SAS'  // A: Empresa
    row[1]  = 'FV'               // B: Tipo Documento
    row[2]  = 'RP'               // C: Prefijo
    row[3]  = consec             // D: Documento Número
    row[4]  = excelDate          // E: Fecha (serial Excel)
    row[5]  = terceroInterno     // F: Tercero Interno
    // G (6) vacío
    row[7]  = 'Factura de Venta' // H: Nota
    row[8]  = 'Repuestos'        // I: FormaPago
    row[9]  = excelDate          // J: Fecha Entrega
    // K, L vacíos
    row[12] = 0                  // M: Verificado
    row[13] = 0                  // N: Anulado
    // O-AE (14-30) vacíos
    row[31] = refCode            // AF: Producto
    row[32] = 'Principal'        // AG: Bodega
    row[33] = 'und.'             // AH: UnidadDeMedida
    row[34] = item.cantidad      // AI: Cantidad
    row[35] = 0.19               // AJ: IVA
    row[36] = Math.round(item.precio_venta) // AK: Valor Unitario (sin formato)
    row[37] = 0                  // AL: Descuento
    row[38] = excelDate          // AM: Vencimiento
    // AN-BE (39-56) vacíos

    row.forEach((val, ci) => {
      if (val === null) return
      const addr = XLSX.utils.encode_cell({ r, c: ci })
      if (typeof val === 'number') {
        // Las columnas de fecha (E=4, J=9, AM=38) necesitan formato de fecha
        if (ci === 4 || ci === 9 || ci === 38) {
          ws[addr] = { t: 'n', v: val, z: 'M/D/YY' }
        } else {
          ws[addr] = { t: 'n', v: val }
        }
      } else {
        ws[addr] = { t: 's', v: String(val) }
      }
    })
  })

  ws['!ref'] = XLSX.utils.encode_range(range)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Planilla_Venta_Rep_UMA.xlsx"`,
    },
  })
}
