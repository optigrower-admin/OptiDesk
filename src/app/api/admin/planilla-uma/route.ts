import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import XLSXStyle from 'xlsx-js-style'
import path from 'path'
import fs from 'fs'

function toExcelDate(isoString: string): number {
  // Colombia es UTC-5: convertir a hora local antes de calcular el número de serie
  const colMs = new Date(isoString).getTime() - 5 * 3600000
  return Math.floor(colMs / 86400000) + 25569
}

function extraerCodigo(descripcion: string): string {
  const sep = descripcion.indexOf(' - ')
  return sep > 0 ? descripcion.slice(0, sep) : descripcion
}

// Lubricantes exentos de IVA en la planilla WorldOffice: los códigos exactos
// de esta lista, más cualquier otro del catálogo de Lubricantes cuya
// Descripción empiece con "ACEITE" (ver repuestos_uma.tipo='lubricante').
const CODIGOS_LUBRICANTES_SIN_IVA = new Set([
  '10W50', '20W50', '20W50 SINTETICO', '3 W ACEITE BGO 20W50', 'ACEITE BGO 20W50 1LT PAR',
  'BGO10W30-1LT2W', 'BGO20W50-100MLT2W', 'BGO20W50-S-1LT2W',
])

function esLubricanteSinIva(codigo: string | null | undefined, descripcionCatalogo: string | null | undefined): boolean {
  const cod = (codigo ?? '').trim().toUpperCase()
  if (cod && CODIGOS_LUBRICANTES_SIN_IVA.has(cod)) return true
  return (descripcionCatalogo ?? '').trim().toUpperCase().startsWith('ACEITE')
}

// Columnas con fondo azul en la plantilla WorldOffice (índices 0-based)
const BLUE_COLS = new Set([
  0,1,3,4,5,6,7,8,9,12,13,          // A B D E F G H I J M N
  31,32,33,34,35,36,37,38             // AF AG AH AI AJ AK AL AM
])

const BLUE_FILL = { fgColor: { rgb: '83CBEB' }, patternType: 'solid' }
const NO_FILL   = { patternType: 'none' }

const HEADERS = [
  'Encab: Empresa','Encab: Tipo Documento','Encab: Prefijo','Encab: Documento Número',
  'Encab: Fecha','Encab: Tercero Interno','Encab: Tercero Externo','Encab: Nota',
  'Encab: FormaPago','Encab: Fecha Entrega','Encab: Prefijo Documento Externo',
  'Encab: Número_Documento_Externo','Encab: Verificado','Encab: Anulado',
  'Encab: Personalizado 1','Encab: Personalizado 2','Encab: Personalizado 3',
  'Encab: Personalizado 4','Encab: Personalizado 5','Encab: Personalizado 6',
  'Encab: Personalizado 7','Encab: Personalizado 8','Encab: Personalizado 9',
  'Encab: Personalizado 10','Encab: Personalizado 11','Encab: Personalizado 12',
  'Encab: Personalizado 13','Encab: Personalizado 14','Encab: Personalizado 15',
  'Encab: Sucursal','Encab: Clasificación',
  'Detalle: Producto','Detalle: Bodega','Detalle: UnidadDeMedida','Detalle: Cantidad',
  'Detalle: IVA','Detalle: Valor Unitario','Detalle: Descuento','Detalle: Vencimiento',
  'Detalle: Nota','Detalle: Centro costos',
  'Detalle: Personalizado1','Detalle: Personalizado2','Detalle: Personalizado3',
  'Detalle: Personalizado4','Detalle: Personalizado5','Detalle: Personalizado6',
  'Detalle: Personalizado7','Detalle: Personalizado8','Detalle: Personalizado9',
  'Detalle: Personalizado10','Detalle: Personalizado11','Detalle: Personalizado12',
  'Detalle: Personalizado13','Detalle: Personalizado14','Detalle: Personalizado15',
  'Detalle: Código Centro Costos',
]

const NCOLS = HEADERS.length // 57

interface ItemOrdenRow {
  id: string
  descripcion: string
  precio_venta: number
  cantidad: number
  created_at: string
  repuestos_uma: { codigo: string; descripcion: string | null; precio_publico_iva: number | null } | null
  ordenes: {
    id: string
    numero: string | null
    placa: string | null
    cliente: string | null
    tipo_orden: string
    created_at: string
  }
}

interface OrdenRow {
  id: string
  numero: string | null
  placa: string | null
  cliente: string | null
  tipo_orden: string
  created_at: string
  estado_pago: string
  items_orden: {
    id: string
    descripcion: string
    precio_venta: number
    cantidad: number
    created_at: string
    origen: string
  }[]
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

  const tenantId: string = perfil.tenant_id
  const { fechaInicio, fechaFin, consecutivoInicial, modoTercero } = await req.json() as {
    fechaInicio: string
    fechaFin: string
    consecutivoInicial: number
    modoTercero: 'consumidor_final' | 'id_consumidores'
  }

  if (!fechaInicio || !fechaFin) return NextResponse.json({ error: 'Faltan fechas' }, { status: 400 })

  // Colombia es UTC-5: medianoche COT = 05:00 UTC; fin del día COT = 04:59:59 UTC del día siguiente
  const desdeISO = fechaInicio + 'T05:00:00.000Z'
  const fechaFinNext = new Date(fechaFin + 'T05:00:00.000Z')
  fechaFinNext.setUTCDate(fechaFinNext.getUTCDate() + 1)
  fechaFinNext.setUTCHours(4, 59, 59, 999)
  const hastaISO = fechaFinNext.toISOString()

  // Filtrar por items_orden.created_at: fecha en que se ingresó cada repuesto UMA.
  // No se filtra por estado_pago: un repuesto UMA ya salió del inventario físico
  // en cuanto se agrega a la orden, sin importar si el cliente pagó completo,
  // abonó, o todavía no ha pagado nada — WorldOffice debe reflejar ese
  // movimiento de inventario siempre.
  const [{ data: itemsServicio, error: e1 }, { data: itemsVenta, error: e2 }] = await Promise.all([
    supabase.from('items_orden')
      .select('id, descripcion, precio_venta, cantidad, created_at, repuestos_uma:repuesto_uma_id(codigo,descripcion,precio_publico_iva), ordenes!inner(id, numero, placa, cliente, tipo_orden, created_at, tenant_id, estado_pago)')
      .eq('origen', 'uma').eq('ordenes.tenant_id', tenantId).eq('ordenes.tipo_orden', 'servicio')
      .gte('created_at', desdeISO).lte('created_at', hastaISO).order('created_at'),
    supabase.from('items_orden')
      .select('id, descripcion, precio_venta, cantidad, created_at, repuestos_uma:repuesto_uma_id(codigo,descripcion,precio_publico_iva), ordenes!inner(id, numero, placa, cliente, tipo_orden, created_at, tenant_id, estado_pago)')
      .eq('origen', 'uma').eq('ordenes.tenant_id', tenantId).eq('ordenes.tipo_orden', 'venta_repuestos')
      .gte('created_at', desdeISO).lte('created_at', hastaISO).order('created_at'),
  ])

  if (e1 || e2) return NextResponse.json({ error: e1?.message ?? e2?.message }, { status: 500 })

  const todosItems: ItemOrdenRow[] = [
    ...((itemsServicio ?? []) as unknown as ItemOrdenRow[]),
    ...((itemsVenta   ?? []) as unknown as ItemOrdenRow[]),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Consecutivo por orden
  const ordenConsec = new Map<string, number>()
  let nextC = Number(consecutivoInicial) || 1
  for (const item of todosItems) {
    if (!ordenConsec.has(item.ordenes.id)) ordenConsec.set(item.ordenes.id, nextC++)
  }

  // Cédulas por placa (solo modo id_consumidores)
  const placaCedula = new Map<string, string>()
  if (modoTercero === 'id_consumidores') {
    const placas = [...new Set(todosItems.map(i => i.ordenes.placa).filter(Boolean))] as string[]
    if (placas.length > 0) {
      const { data: motos } = await supabase.from('motos')
        .select('placa, cliente_id').eq('tenant_id', tenantId).in('placa', placas)
      const clienteIds = [...new Set((motos ?? []).map((m: { cliente_id: string | null }) => m.cliente_id).filter(Boolean))] as string[]
      if (clienteIds.length > 0) {
        const { data: clientes } = await supabase.from('clientes').select('id, cedula').in('id', clienteIds)
        const map = new Map<string, string>()
        for (const c of (clientes ?? []) as { id: string; cedula: string | null }[]) {
          if (c.cedula) map.set(c.id, c.cedula)
        }
        for (const m of (motos ?? []) as { placa: string; cliente_id: string | null }[]) {
          if (m.placa && m.cliente_id) {
            const ced = map.get(m.cliente_id)
            if (ced) placaCedula.set(m.placa, ced)
          }
        }
      }
    }
  }

  // ── Construir workbook con xlsx-js-style ──────────────────────────────────
  const ws: XLSXStyle.WorkSheet = {}
  const totalRows = 1 + todosItems.length

  // Fila 0: headers con estilos del template
  HEADERS.forEach((h, ci) => {
    const addr = XLSXStyle.utils.encode_cell({ r: 0, c: ci })
    ws[addr] = {
      t: 's',
      v: h,
      s: {
        fill: BLUE_COLS.has(ci) ? BLUE_FILL : NO_FILL,
        font: { bold: false, sz: 11 },
      },
    }
  })

  // Filas de datos
  todosItems.forEach((item, ri) => {
    const r = ri + 1
    const orden = item.ordenes
    const consec   = ordenConsec.get(orden.id) ?? nextC
    const excelDt  = toExcelDate(item.created_at)
    const refCode  = item.repuestos_uma?.codigo ?? extraerCodigo(item.descripcion)
    const precioUnitario = Math.round(item.precio_venta)
    const iva = esLubricanteSinIva(refCode, item.repuestos_uma?.descripcion) ? 0 : 0.19
    const tercero  = modoTercero === 'consumidor_final'
      ? '222222222'
      : (orden.placa ? placaCedula.get(orden.placa) : undefined) ?? '222222222'

    // [colIndex, value, type, numberFormat?]
    const cells: [number, string | number, 's' | 'n', string?][] = [
      [0,  'MOTOSPACE38 SAS',              's'],
      [1,  'FV',                            's'],
      [2,  'RP',                            's'],
      [3,  consec,                          'n'],
      [4,  excelDt,                         'n', 'DD/MM/YYYY'],
      [5,  tercero,                         's'],
      [7,  'Factura de Venta',              's'],
      [8,  'Repuestos',                     's'],
      [9,  excelDt,                         'n', 'DD/MM/YYYY'],
      [12, 0,                               'n'],
      [13, 0,                               'n'],
      [31, refCode,                         's'],
      [32, 'Principal',                     's'],
      [33, 'und.',                          's'],
      [34, item.cantidad,                   'n'],
      [35, iva,                              'n'],
      [36, precioUnitario,                   'n'],
      [37, 0,                               'n'],
      [38, excelDt,                         'n', 'DD/MM/YYYY'],
    ]

    for (const [ci, val, t, fmt] of cells) {
      const addr = XLSXStyle.utils.encode_cell({ r, c: ci })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cell: any = { t, v: val }
      if (fmt) cell.z = fmt
      ws[addr] = cell
    }
  })

  ws['!ref'] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: NCOLS - 1 } })

  // Copiar anchos de columna del template original
  try {
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'plantilla-uma.xlsx')
    const templateBuf  = fs.readFileSync(templatePath)
    const templateWb   = XLSXStyle.read(templateBuf, { type: 'buffer' })
    const templateWs   = templateWb.Sheets[templateWb.SheetNames[0]]
    if (templateWs['!cols']) ws['!cols'] = templateWs['!cols']
  } catch { /* si no existe el template, no hay cols → ok */ }

  const wb = XLSXStyle.utils.book_new()
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Hoja1')

  const buf = XLSXStyle.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const body = new Uint8Array(buf)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Planilla_Venta_Rep_UMA.xlsx"',
      'X-Next-Consecutivo': String(nextC),
    },
  })
}
