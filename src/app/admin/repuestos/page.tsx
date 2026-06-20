'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { registrarAuditoria } from '@/lib/audit'
import { ImportadorExcel } from '@/components/ImportadorExcel'
import { importarVentaRepuestos } from '@/lib/bulkImport'

type Tab = 'catalogo' | 'ventas'
type FiltroOrigen = 'todos' | 'uma' | 'terceros'

// ─── CATÁLOGO ────────────────────────────────────────────────
interface ItemCatalogo {
  id: string
  tipo: 'uma' | 'externo'
  codigo: string | null
  nombre: string
  subtipo: string | null
  modelo_aplicable: string | null
  precio_venta: number | null
  costo: number | null
  stock: number | null
  activo?: boolean
}

// ─── VENTAS ──────────────────────────────────────────────────
interface ItemVenta {
  id: string
  descripcion: string
  origen: 'uma' | 'externo' | 'mano_obra'
  cantidad: number
  costo: number
  precio_venta: number
  created_at: string
  ordenes: {
    id: string
    numero: number
    placa: string | null
    cliente: string
    cedula: string | null
    celular: string | null
    tipo_orden: string
    estado_pago: string | null
    created_at: string
  } | null
}

interface AuditEntry {
  id: string
  tipo: string
  descripcion: string | null
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  created_at: string
  usuarios: { nombre: string; email: string } | null
}

function formatAuditDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function AdminRepuestosPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('ventas')
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>('todos')
  const [busqueda, setBusqueda] = useState('')

  // Catálogo — 3 buscadores independientes
  const [busquedaRef, setBusquedaRef] = useState('')
  const [busquedaNombre, setBusquedaNombre] = useState('')
  const [busquedaModelo, setBusquedaModelo] = useState('')
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [loadingCat, setLoadingCat] = useState(false)

  // Ventas — flat list por ítem
  const [ventas, setVentas] = useState<ItemVenta[]>([])
  const [tenantNombre, setTenantNombre] = useState('Motospace')
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [auditLabel, setAuditLabel] = useState('')
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [loadingCSV, setLoadingCSV] = useState(false)

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('nombre').eq('id', profile.tenant_id).single().then(({ data }) => {
      if (data) setTenantNombre((data as { nombre: string }).nombre)
    })
  }, [profile?.tenant_id])

  // ─── Catálogo ────────────────────────────────────────────
  const cargarCatalogo = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoadingCat(true)

    const incluirUma = filtroOrigen !== 'terceros'
    const incluirExt = filtroOrigen !== 'uma'

    let qUma = supabase
      .from('repuestos_uma')
      .select('id, codigo, descripcion, subgrupo, modelo_aplicable, precio_publico_iva, precio_distribuidor_sin_iva, cantidad, activo')
      .eq('tenant_id', profile.tenant_id)
    if (busquedaRef) qUma = qUma.ilike('codigo', `%${busquedaRef}%`)
    if (busquedaNombre) qUma = qUma.ilike('descripcion', `%${busquedaNombre}%`)
    if (busquedaModelo) qUma = qUma.ilike('modelo_aplicable', `%${busquedaModelo}%`)

    let qExt = supabase
      .from('repuestos_externos')
      .select('id, codigo, nombre, subgrupo, modelo_aplicable, ultimo_costo, ultimo_precio_venta')
      .eq('tenant_id', profile.tenant_id)
    if (busquedaRef) qExt = qExt.ilike('codigo', `%${busquedaRef}%`)
    if (busquedaNombre) qExt = qExt.ilike('nombre', `%${busquedaNombre}%`)
    if (busquedaModelo) qExt = qExt.ilike('modelo_aplicable', `%${busquedaModelo}%`)

    const [{ data: uma }, { data: ext }] = await Promise.all([
      incluirUma ? qUma.order('codigo').limit(1000) : Promise.resolve({ data: [] as unknown[] }),
      incluirExt ? qExt.order('created_at', { ascending: false }).limit(1000) : Promise.resolve({ data: [] as unknown[] }),
    ])

    const umaItems: ItemCatalogo[] = ((uma ?? []) as { id: string; codigo: string; descripcion: string; subgrupo: string | null; modelo_aplicable: string | null; precio_publico_iva: number | null; precio_distribuidor_sin_iva: number | null; cantidad: number; activo: boolean }[]).map((r) => ({
      id: r.id, tipo: 'uma' as const, codigo: r.codigo, nombre: r.descripcion,
      subtipo: r.subgrupo, modelo_aplicable: r.modelo_aplicable,
      precio_venta: r.precio_publico_iva, costo: r.precio_distribuidor_sin_iva,
      stock: r.cantidad, activo: r.activo,
    }))

    const extItems: ItemCatalogo[] = ((ext ?? []) as { id: string; codigo: string | null; nombre: string; subgrupo: string | null; modelo_aplicable: string | null; ultimo_costo: number | null; ultimo_precio_venta: number | null }[]).map((r) => ({
      id: r.id, tipo: 'externo' as const, codigo: r.codigo, nombre: r.nombre,
      subtipo: r.subgrupo, modelo_aplicable: r.modelo_aplicable,
      precio_venta: r.ultimo_precio_venta, costo: r.ultimo_costo, stock: null,
    }))

    setCatalogo([...umaItems, ...extItems])
    setLoadingCat(false)
  }, [profile?.tenant_id, filtroOrigen, busquedaRef, busquedaNombre, busquedaModelo])

  // ─── Ventas ──────────────────────────────────────────────
  const cargarVentas = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoadingVentas(true)

    let query = supabase
      .from('items_orden')
      .select(`
        id, descripcion, origen, cantidad, costo, precio_venta, created_at,
        ordenes!inner(id, numero, placa, cliente, cedula, celular, tipo_orden, estado_pago, created_at, tenant_id)
      `)
      .eq('ordenes.tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(500)

    if (filtroOrigen === 'uma') query = query.eq('origen', 'uma')
    else if (filtroOrigen === 'terceros') query = query.eq('origen', 'externo')
    if (fechaDesde) query = query.gte('created_at', fechaDesde)
    if (fechaHasta) query = query.lte('created_at', fechaHasta + 'T23:59:59')

    const { data } = await query
    let items = (data as unknown as ItemVenta[]) ?? []

    if (busqueda) {
      const b = busqueda.toLowerCase()
      items = items.filter((i) =>
        i.descripcion.toLowerCase().includes(b) ||
        i.ordenes?.placa?.toLowerCase().includes(b) ||
        i.ordenes?.cliente?.toLowerCase().includes(b) ||
        i.ordenes?.cedula?.toLowerCase().includes(b) ||
        i.ordenes?.celular?.toLowerCase().includes(b)
      )
    }

    setVentas(items)
    setLoadingVentas(false)
  }, [profile?.tenant_id, filtroOrigen, busqueda, fechaDesde, fechaHasta])

  useEffect(() => {
    if (tab === 'catalogo') cargarCatalogo()
    else cargarVentas()
  }, [tab, cargarCatalogo, cargarVentas])

  const limpiarBuscadoresCatalogo = () => { setBusquedaRef(''); setBusquedaNombre(''); setBusquedaModelo('') }

  const handleDeleteItem = async (item: ItemVenta) => {
    if (item.ordenes?.tipo_orden !== 'venta_repuestos') return
    if (!confirm(`¿Eliminar "${item.descripcion}"?`)) return
    await supabase.from('items_orden').delete().eq('id', item.id)
    if (item.ordenes) {
      const { data: rest } = await supabase.from('items_orden').select('precio_venta, cantidad').eq('orden_id', item.ordenes.id)
      const newTotal = ((rest as { precio_venta: number; cantidad: number }[]) ?? []).reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await supabase.from('ordenes').update({ valor_total: newTotal }).eq('id', item.ordenes.id)
    }
    await registrarAuditoria(supabase, {
      tenant_id: profile?.tenant_id ?? '',
      tabla: 'items_orden',
      registro_id: item.id,
      tipo: 'eliminacion',
      valor_anterior: { descripcion: item.descripcion, precio_venta: item.precio_venta, cantidad: item.cantidad },
      descripcion: `Eliminó ítem "${item.descripcion}" de venta directa #${item.ordenes?.numero}`,
      usuario_id: profile?.id,
    })
    await cargarVentas()
  }

  const openAudit = async (item: ItemVenta) => {
    if (!item.ordenes) return
    const orderId = item.ordenes.id
    setAuditLabel(`Orden #${item.ordenes.numero}`)
    setShowAudit(true)
    setAuditLog([])
    setLoadingAudit(true)
    const sel = 'id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)'
    const [r1, r2] = await Promise.all([
      supabase.from('auditoria').select(sel).eq('registro_id', orderId).eq('tabla', 'ordenes').order('created_at', { ascending: false }).limit(30),
      supabase.from('auditoria').select(sel).eq('tabla', 'items_orden').filter('valor_anterior->>orden_id', 'in', `(${orderId})`).order('created_at', { ascending: false }).limit(50),
    ])
    const all = [
      ...((r1.data as unknown as AuditEntry[]) ?? []),
      ...((r2.data as unknown as AuditEntry[]) ?? []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setAuditLog(all)
    setLoadingAudit(false)
  }

  const imprimirConIframe = (html: string) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;opacity:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* ya eliminado */ } }, 2000)
    }, 350)
  }

  const handlePrintItem = async (item: ItemVenta) => {
    if (!item.ordenes) return
    const { data: allItemsData } = await supabase
      .from('items_orden')
      .select('descripcion, origen, cantidad, precio_venta')
      .eq('orden_id', item.ordenes.id)
      .order('origen')
    const allItems = (allItemsData ?? []) as { descripcion: string; origen: string; cantidad: number; precio_venta: number }[]
    const repItems = allItems.filter((i) => i.origen !== 'mano_obra')
    const moItems = allItems.filter((i) => i.origen === 'mano_obra')
    const total = allItems.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    const o = item.ordenes

    const rowsHtml = (rows: { descripcion: string; cantidad: number; precio_venta: number }[]) =>
      rows.map((r) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${r.descripcion}${r.cantidad > 1 ? ' ×' + r.cantidad : ''}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${formatCOP(r.precio_venta * r.cantidad)}</td>
      </tr>`).join('')

    imprimirConIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        @page{size:letter;margin:20mm}
        body{font-family:Arial,sans-serif;font-size:12px;color:#111;max-width:700px;margin:0 auto}
        h1{font-size:18px;margin:0 0 4px}
        .info{color:#555;font-size:11px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;font-size:11px;color:#888;padding:6px 0;border-bottom:2px solid #ddd}
        th:last-child,td:last-child{text-align:right}
        .section-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;padding:10px 0 4px;font-weight:600}
        .total-row td{font-size:14px;font-weight:bold;padding-top:12px;border-top:2px solid #111}
        .footer{margin-top:20px;font-size:10px;color:#888;text-align:center}
      </style></head><body>
      <h1>${tenantNombre.toUpperCase()}</h1>
      <div class="info">
        Factura #${o.numero}<br>
        ${o.cliente}${o.placa ? ' · Placa: ' + o.placa : ''}${o.cedula ? ' · Cédula: ' + o.cedula : ''}${o.celular ? ' · Tel: ' + o.celular : ''}<br>
        Fecha: ${new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <table>
        <thead><tr><th>Descripción</th><th>Total</th></tr></thead>
        <tbody>
          ${repItems.length > 0 ? `<tr><td colspan="2" class="section-label">Repuestos</td></tr>${rowsHtml(repItems)}` : ''}
          ${moItems.length > 0 ? `<tr><td colspan="2" class="section-label">Mano de obra</td></tr>${rowsHtml(moItems)}` : ''}
          <tr class="total-row"><td>TOTAL</td><td>${formatCOP(total)}</td></tr>
        </tbody>
      </table>
      <div class="footer">Precios incluyen impuestos</div>
    </body></html>`)
  }

  const handleDescargarCSV = () => {
    if (ventas.length === 0) return
    setLoadingCSV(true)
    const headers = ['Fecha ítem', '# Orden', 'Tipo', 'Placa', 'Cliente', 'Cédula', 'Celular', 'Descripción', 'Origen', 'Cantidad', 'P. Unitario', 'Total ítem', 'Costo unitario', 'Margen', 'Estado pago']
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = ventas.map((item) => {
      const o = item.ordenes
      const total = item.precio_venta * item.cantidad
      const margen = total - item.costo * item.cantidad
      return [
        new Date(item.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
        o ? String(o.numero) : '',
        o?.tipo_orden === 'venta_repuestos' ? 'Venta directa' : 'Servicio técnico',
        o?.placa ?? '', o?.cliente ?? '', o?.cedula ?? '', o?.celular ?? '',
        item.descripcion,
        item.origen === 'uma' ? 'UMA' : item.origen === 'externo' ? 'Externo' : 'Mano de obra',
        String(item.cantidad), String(item.precio_venta), String(total), String(item.costo), String(margen),
        o?.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente',
      ].map(esc).join(',')
    })
    const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `repuestos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setLoadingCSV(false)
  }

  const totalVentas = ventas.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalCosto = ventas.reduce((s, i) => s + (i.costo ?? 0) * i.cantidad, 0)
  const totalItems = ventas.length

  const FiltroOrigenes = () => (
    <div className="flex gap-2 items-center">
      <span className="text-xs text-gray-500 font-medium">Origen:</span>
      {([
        { value: 'todos', label: 'Todos' },
        { value: 'uma', label: 'UMA' },
        { value: 'terceros', label: 'Terceros' },
      ] as { value: FiltroOrigen; label: string }[]).map((f) => (
        <button key={f.value} onClick={() => setFiltroOrigen(f.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtroOrigen === f.value
              ? f.value === 'uma' ? 'bg-blue-700 text-white' : f.value === 'terceros' ? 'bg-amber-500 text-white' : 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >{f.label}</button>
      ))}
    </div>
  )

  const formatFechaHora = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Repuestos</h1>
        <Link href="/admin/repuestos/nueva-venta"
          className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-amber-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva venta directa
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { value: 'ventas', label: 'Historial ventas' },
          { value: 'catalogo', label: 'Catálogo' },
        ] as { value: Tab; label: string }[]).map((t) => (
          <button key={t.value}
            onClick={() => { setTab(t.value); setBusqueda(''); setFiltroOrigen('todos'); limpiarBuscadoresCatalogo() }}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.value ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'ventas' && (profile?.rol === 'gerencia' || profile?.rol === 'admin') && (
        <ImportadorExcel
          titulo="Carga masiva (Excel) — recuperar ventas de un caído de plataforma"
          descripcion="Cada fila es un ítem vendido. Varias filas con la misma 'Referencia' forman una sola venta. Funciona igual que registrarla manualmente: descuenta inventario de Repuestos UMA y registra el costo de Externos en Caja."
          nombreArchivoPlantilla="plantilla_venta_repuestos.xlsx"
          encabezados={['Referencia', 'Fecha (DD/MM/AAAA)', 'Cliente', 'Cedula', 'Celular', 'Placa (opcional)', 'Descripcion del item', 'Origen (uma/externo)', 'Codigo UMA (si Origen=uma)', 'Codigo externo (opcional, si Origen=externo)', 'Proveedor (opcional, si Origen=externo)', 'Cantidad', 'Costo proveedor', 'Precio de venta', 'Monto pagado (solo en la primera fila de cada venta)']}
          filasEjemplo={[
            ['1', '15/03/2025', 'Juan Pérez', '1020304050', '3001234567', 'ABC123', 'Llanta trasera', 'externo', '', 'LL-300', 'Llantas Express', '1', '80000', '120000', '120000'],
            ['2', '16/03/2025', 'María Gómez', '', '3019876543', '', 'Espejo retrovisor', 'uma', 'ESP-50', '', '', '2', '0', '30000', ''],
          ]}
          notas={[
            'Una fila = un ítem vendido. Para una venta con varios ítems, repite la misma Referencia en todas sus filas.',
            'Referencia: cualquier texto que tú inventes para agrupar las filas de una misma venta. No se guarda en el sistema.',
            'Fecha, Cliente, Cedula, Celular, Placa y Monto pagado solo se leen de la PRIMERA fila de cada Referencia.',
            'Origen: uma o externo.',
            'Si Origen=uma, el Código UMA es obligatorio y debe existir en tu catálogo — con eso se descuenta el inventario igual que en el flujo manual.',
            'Si Origen=externo, el Código externo es opcional: si coincide con uno del catálogo se usa ese (con su costo); si no, se busca por el nombre exacto y, si tampoco existe, se crea uno nuevo con el Costo proveedor, Precio de venta y Proveedor que indiques.',
            'Monto pagado: si lo dejas vacío o en 0, la venta queda "pendiente" de pago. Si es igual o mayor al total, queda "pagado". Si es menor, queda "abono".',
            'Si el Cliente o la Cédula no existen todavía en el sistema, se crean automáticamente.',
          ]}
          procesarFilas={(filas) => importarVentaRepuestos(supabase, profile!.tenant_id, profile!.id, filas)}
          onCompletado={cargarVentas}
        />
      )}

      {/* Búsqueda + filtros */}
      {tab === 'ventas' ? (
        <div className="flex flex-wrap gap-3 items-center">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por repuesto, placa, cliente, cédula..."
            className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <FiltroOrigenes />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          <input value={busquedaRef} onChange={(e) => setBusquedaRef(e.target.value)} placeholder="# Referencia..."
            className="w-40 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
          />
          <input value={busquedaNombre} onChange={(e) => setBusquedaNombre(e.target.value)} placeholder="Nombre del repuesto..."
            className="w-52 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <input value={busquedaModelo} onChange={(e) => setBusquedaModelo(e.target.value)} placeholder="Modelo aplicable..."
            className="w-52 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {(busquedaRef || busquedaNombre || busquedaModelo) && (
            <button onClick={limpiarBuscadoresCatalogo} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Limpiar</button>
          )}
          <FiltroOrigenes />
        </div>
      )}

      {/* ─── TAB CATÁLOGO ─── */}
      {tab === 'catalogo' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 text-xs text-gray-500">
            {loadingCat ? 'Cargando...' : `${catalogo.length} repuestos`}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="text-left py-2 px-5 font-medium"># Referencia</th>
                <th className="text-left py-2 px-3 font-medium">Subtipo</th>
                <th className="text-left py-2 px-3 font-medium">Nombre</th>
                <th className="text-left py-2 px-3 font-medium">Modelo aplicable</th>
                <th className="text-left py-2 px-3 font-medium">Tipo</th>
                <th className="text-center py-2 px-3 font-medium">Stock</th>
                <th className="text-right py-2 px-5 font-medium">P. Venta</th>
              </tr>
            </thead>
            <tbody>
              {loadingCat ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="py-3 px-3"><div className="h-4 bg-gray-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : catalogo.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Sin repuestos en catálogo</td></tr>
              ) : (
                catalogo.map((r) => (
                  <tr key={r.id} className={`border-b hover:bg-gray-50 ${r.activo === false ? 'opacity-40' : ''}`}>
                    <td className="py-2.5 px-5 font-mono text-xs text-gray-500">{r.codigo ?? '—'}</td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">{r.subtipo ?? '—'}</td>
                    <td className="py-2.5 px-3 text-gray-800 max-w-xs truncate">{r.nombre}</td>
                    <td className="py-2.5 px-3 max-w-[200px]">
                      {r.modelo_aplicable ? (
                        <span className="text-xs text-gray-600 truncate block cursor-help" title={r.modelo_aplicable} style={{ maxWidth: '180px' }}>
                          {r.modelo_aplicable}
                        </span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={r.tipo === 'uma' ? 'blue' : 'amber'}>{r.tipo === 'uma' ? 'UMA' : 'Externo'}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-600">{r.stock ?? '—'}</td>
                    <td className="py-2.5 px-5 text-right font-semibold text-gray-900">{r.precio_venta != null ? formatCOP(r.precio_venta) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB VENTAS ─── */}
      {tab === 'ventas' && (
        <>
          {/* Sub-controles */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium">Fechas:</span>
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-xs text-gray-400">–</span>
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {(fechaDesde || fechaHasta) && (
                <button onClick={() => { setFechaDesde(''); setFechaHasta('') }} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                  Limpiar
                </button>
              )}
            </div>
            <button onClick={handleDescargarCSV} disabled={loadingCSV || ventas.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Descargar CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {loadingCSV ? 'Generando...' : 'CSV'}
            </button>
            {!loadingVentas && (
              <span className="text-xs text-gray-500 ml-auto">
                {totalItems} ítems · {formatCOP(totalVentas)} total vendido
              </span>
            )}
          </div>

          {/* Tabla flat */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {loadingVentas ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : ventas.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-sm">Sin ventas registradas{busqueda ? ` para "${busqueda}"` : ''}</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                    <th className="text-left py-2.5 px-4 font-medium whitespace-nowrap">Fecha / Hora</th>
                    <th className="text-left py-2.5 px-3 font-medium">Repuesto</th>
                    <th className="text-left py-2.5 px-3 font-medium">Origen</th>
                    <th className="text-left py-2.5 px-3 font-medium">Tipo Origen</th>
                    <th className="text-left py-2.5 px-3 font-medium">ID Interno</th>
                    <th className="text-left py-2.5 px-3 font-medium">Estado pago</th>
                    <th className="text-left py-2.5 px-3 font-medium">Cliente</th>
                    <th className="text-right py-2.5 px-3 font-medium">Costo</th>
                    <th className="text-right py-2.5 px-3 font-medium">P. Venta</th>
                    <th className="py-2.5 px-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((item) => {
                    const esVentaDirecta = item.ordenes?.tipo_orden === 'venta_repuestos'
                    const esPendiente = item.ordenes?.estado_pago === 'pendiente' || item.ordenes?.estado_pago === 'abono'
                    return (
                      <tr key={item.id} className={`border-b group ${esPendiente ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-4 text-xs text-gray-500 whitespace-nowrap">
                          {formatFechaHora(item.created_at)}
                        </td>
                        <td className="py-2.5 px-3 max-w-[180px]">
                          <span className={`block truncate ${esPendiente ? 'text-red-800 font-medium' : 'text-gray-800'}`} title={item.descripcion}>{item.descripcion}</span>
                          {item.cantidad > 1 && <span className="text-xs text-gray-400">×{item.cantidad}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant={item.origen === 'uma' ? 'blue' : 'amber'}>
                            {item.origen === 'uma' ? 'UMA' : 'Terceros'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3">
                          {item.ordenes ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${esVentaDirecta ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {esVentaDirecta ? 'Venta' : 'S.T.'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.ordenes ? (
                            <a href={esVentaDirecta ? `/admin/repuestos/nueva-venta?id=${item.ordenes.id}` : `/admin/ordenes/${item.ordenes.id}`}
                              className="text-gray-500 text-xs font-mono hover:text-blue-700 transition-colors"
                            >
                              #{item.ordenes.numero}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.ordenes?.estado_pago ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              item.ordenes.estado_pago === 'pagado' ? 'bg-green-100 text-green-700' :
                              item.ordenes.estado_pago === 'abono' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-600'
                            }`}>
                              {item.ordenes.estado_pago === 'pagado' ? 'Pagado' : item.ordenes.estado_pago === 'abono' ? 'Abono' : 'Pendiente'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-600 max-w-[120px]">
                          <span className="block truncate" title={item.ordenes?.cliente ?? ''}>{item.ordenes?.cliente ?? '—'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-xs text-gray-500 whitespace-nowrap">
                          {item.costo ? formatCOP(item.costo * item.cantidad) : '—'}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${esPendiente ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCOP(item.precio_venta * item.cantidad)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handlePrintItem(item)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50" title="Imprimir factura">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                            <button onClick={() => openAudit(item)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50" title="Ver historial">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            {esVentaDirecta && item.ordenes && (
                              <Link href={`/admin/repuestos/nueva-venta?id=${item.ordenes.id}`}
                                className="text-gray-400 hover:text-amber-600 p-1.5 rounded hover:bg-amber-50" title="Editar"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </Link>
                            )}
                            {esVentaDirecta && (
                              <button onClick={() => handleDeleteItem(item)} className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50" title="Eliminar">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={7} className="py-2.5 px-4 text-xs text-gray-500 font-medium">{totalItems} ítems en total</td>
                    <td className="py-2.5 px-3 text-right text-xs text-gray-500 font-medium whitespace-nowrap">{formatCOP(totalCosto)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatCOP(totalVentas)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ─── Modal historial ─── */}
      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={() => setShowAudit(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Historial de cambios</h3>
                <p className="text-xs text-gray-400 mt-0.5">{auditLabel}</p>
              </div>
              <button onClick={() => setShowAudit(false)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingAudit ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse border-l-2 border-gray-200 pl-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : auditLog.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Sin historial disponible</p>
                </div>
              ) : (
                auditLog.map((entry) => (
                  <div key={entry.id} className="border-l-2 border-amber-200 pl-3 py-0.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-800 font-medium leading-snug">{entry.descripcion ?? entry.tipo}</p>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">{formatAuditDate(entry.created_at)}</span>
                    </div>
                    {entry.usuarios && (
                      <p className="text-xs text-gray-400">por {(entry.usuarios as { nombre: string; email: string }).email}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
