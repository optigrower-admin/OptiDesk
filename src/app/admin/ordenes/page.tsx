'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { OrderStatus } from '@/components/OrderStatus'
import { normalizarPlaca, formatCOP } from '@/lib/utils'
import { ImportadorExcel } from '@/components/ImportadorExcel'
import { ManualesPartesModal } from '@/components/ManualesPartesModal'
import { importarServicioTecnico, previsualizarServicioTecnico } from '@/lib/bulkImport'

function formatFechaPlaca(iso: string): string {
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
  const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${fecha} · ${hora}`
}

interface Orden {
  id: string
  numero: number
  placa: string
  cliente: string
  telefono: string | null
  estado: string
  estado_pago: string
  valor_total: number
  valor_abono: number | null
  fecha_programada: string | null
  duracion_estimada_horas: number | null
  tipo_orden: string | null
  tipo_servicio: string | null
  created_at: string
  fecha_finalizacion: string | null
  numeros_orden_uma: string[] | null
  categorias_servicio: { nombre: string } | null
  usuarios: { nombre: string } | null
}

interface GrupoPlaca {
  placa: string
  ordenes: Orden[]
  expandido: boolean
  repuestosPendientes: number
}

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

type FiltroEstado = 'todos' | 'activos' | 'programado' | 'falta_revision' | 'en_proceso' | 'pendiente' | 'pagado' | 'listo'

const SELECT_FIELDS = 'id, numero, placa, cliente, telefono, estado, estado_pago, valor_total, valor_abono, fecha_programada, duracion_estimada_horas, tipo_orden, tipo_servicio, created_at, fecha_finalizacion, numeros_orden_uma, categorias_servicio(nombre), usuarios:mecanico_id(nombre)'

export default function AdminOrdenesPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [grupos, setGrupos] = useState<GrupoPlaca[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroSubcategoria, setFiltroSubcategoria] = useState('todos')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [filtroOrdenPendiente, setFiltroOrdenPendiente] = useState(false)
  const [loadingCSV, setLoadingCSV] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [manualesOpen, setManualesOpen] = useState(false)
  const cancelRef = useRef(false)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!profile?.tenant_id) return
    const channel = supabase
      .channel(`ordenes-list-${profile.tenant_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes', filter: `tenant_id=eq.${profile.tenant_id}` },
        () => setRefreshTick((t) => t + 1)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items_orden' },
        () => setRefreshTick((t) => t + 1)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.tenant_id])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase
      .from('categorias_servicio')
      .select('id, nombre, subcategorias_servicio(id, nombre)')
      .eq('tenant_id', profile.tenant_id)
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => setCategorias((data as Categoria[]) ?? []))
  }, [profile?.tenant_id])

  useEffect(() => {
    if (!profile?.tenant_id) return
    cancelRef.current = false
    if (!hasLoadedRef.current) setLoading(true)

    const run = async () => {
      let q = supabase
        .from('ordenes')
        .select(SELECT_FIELDS)
        .eq('tenant_id', profile.tenant_id)
        .eq('tipo_orden', 'servicio')
        .order('created_at', { ascending: false })

      if (filtroEstado === 'activos') {
        q = q.in('estado', ['programado', 'falta_revision', 'en_proceso', 'pendiente'])
      } else if (filtroEstado !== 'todos') {
        q = q.eq('estado', filtroEstado)
      }
      if (filtroCategoria !== 'todos') q = q.eq('categoria_servicio_id', filtroCategoria)
      if (filtroSubcategoria !== 'todos') q = q.contains('subcategoria_servicio_ids', [filtroSubcategoria])
      if (busqueda) {
        const b = busqueda.trim()
        // Búsqueda por placa, nombre cliente o # orden UMA
        q = q.or(`placa.ilike.%${normalizarPlaca(b)}%,cliente.ilike.%${b}%,numeros_orden_uma.cs.{${b}}`)
      }
      if (fechaDesde) q = q.gte('created_at', fechaDesde)
      if (fechaHasta) q = q.lte('created_at', fechaHasta + 'T23:59:59')

      const { data: sData } = await q.limit(300)
      if (cancelRef.current) return

      const sOrdenes = (sData as unknown as Orden[]) ?? []
      const placas = [...new Set(sOrdenes.map((o) => o.placa).filter(Boolean))]

      let vOrdenes: Orden[] = []
      if (placas.length > 0) {
        const { data: vData } = await supabase
          .from('ordenes')
          .select(SELECT_FIELDS)
          .eq('tenant_id', profile.tenant_id)
          .eq('tipo_orden', 'venta_repuestos')
          .in('placa', placas)
          .order('created_at', { ascending: false })
          .limit(200)
        if (!cancelRef.current) vOrdenes = (vData as unknown as Orden[]) ?? []
      }

      if (cancelRef.current) return

      const map = new Map<string, Orden[]>()
      for (const o of sOrdenes) {
        if (!map.has(o.placa)) map.set(o.placa, [])
        map.get(o.placa)!.push(o)
      }
      for (const v of vOrdenes) {
        if (map.has(v.placa)) map.get(v.placa)!.push(v)
      }

      // Contar repuestos pendientes por orden
      const allOrderIds = [...sOrdenes, ...vOrdenes].map((o) => o.id)
      const pendientesPorOrden = new Map<string, number>()
      if (allOrderIds.length > 0) {
        const { data: itemsPend } = await supabase
          .from('items_orden')
          .select('orden_id')
          .in('orden_id', allOrderIds)
          .eq('estado_repuesto', 'pedido')
        if (!cancelRef.current && itemsPend) {
          for (const item of itemsPend as { orden_id: string }[]) {
            pendientesPorOrden.set(item.orden_id, (pendientesPorOrden.get(item.orden_id) ?? 0) + 1)
          }
        }
      }

      setGrupos((prev) => {
        const expandidoPorPlaca = new Map(prev.map((g) => [g.placa, g.expandido]))
        return Array.from(map.entries()).map(([placa, ords]) => ({
          placa,
          ordenes: ords,
          expandido: expandidoPorPlaca.get(placa) ?? false,
          repuestosPendientes: ords.reduce((s, o) => s + (pendientesPorOrden.get(o.id) ?? 0), 0),
        }))
      })
      hasLoadedRef.current = true
      setLoading(false)
    }

    run()
    return () => { cancelRef.current = true }
  }, [profile?.tenant_id, busqueda, filtroEstado, filtroCategoria, filtroSubcategoria, fechaDesde, fechaHasta, refreshTick])

  const toggleGrupo = (placa: string) => {
    setGrupos((prev) => prev.map((g) => g.placa === placa ? { ...g, expandido: !g.expandido } : g))
  }

  const estadoActivo = (o: Orden) => ['programado', 'falta_revision', 'en_proceso', 'pendiente'].includes(o.estado)
  const esServicio = (o: Orden) => o.tipo_orden !== 'venta_repuestos'

  const tieneOrdenUMAPendiente = (grupo: GrupoPlaca) =>
    grupo.ordenes.filter(esServicio).some((o) => {
      if (o.estado === 'listo') return false
      const cat = o.categorias_servicio?.nombre ?? ''
      if (!cat.toLowerCase().includes('uma')) return false
      const nums = o.numeros_orden_uma ?? []
      return !nums.includes('N/A') && nums.filter((n) => n !== 'N/A').length === 0
    })

  const gruposFiltrados = filtroOrdenPendiente ? grupos.filter(tieneOrdenUMAPendiente) : grupos

  const totalOrdenes = gruposFiltrados.reduce((s, g) => s + g.ordenes.filter(esServicio).length, 0)

  const limpiarFechas = () => { setFechaDesde(''); setFechaHasta('') }

  const handleDescargarCSV = async () => {
    setLoadingCSV(true)
    try {
      const todasOrdenes = gruposFiltrados.flatMap((g) => g.ordenes).filter((o) => o.tipo_orden !== 'venta_repuestos')
      if (todasOrdenes.length === 0) return
      const ordenIds = todasOrdenes.map((o) => o.id)

      const { data: itemsData } = await supabase
        .from('items_orden')
        .select('orden_id, descripcion, origen, cantidad, precio_venta, costo')
        .in('orden_id', ordenIds)

      const itemsMap = new Map<string, { descripcion: string; origen: string; cantidad: number; precio_venta: number; costo: number }[]>()
      for (const item of (itemsData ?? []) as { orden_id: string; descripcion: string; origen: string; cantidad: number; precio_venta: number; costo: number }[]) {
        if (!itemsMap.has(item.orden_id)) itemsMap.set(item.orden_id, [])
        itemsMap.get(item.orden_id)!.push(item)
      }

      const ESTADO_LABELS: Record<string, string> = {
        programado: 'Programado', falta_revision: 'Falta revisión', en_proceso: 'En proceso',
        pendiente: 'Pendiente', pagado: 'Pagado', listo: 'Finalizado',
      }
      const PAGO_LABELS: Record<string, string> = {
        pagado: 'Pagado', abono: 'Abono', pendiente: 'Pendiente',
      }
      const ORIGEN_LABELS: Record<string, string> = {
        uma: 'UMA', externo: 'Externo', mano_obra: 'Mano de obra',
      }

      const headers = [
        'Fecha', '# Orden', 'Placa', 'Cliente', 'Estado', 'Estado Pago',
        'Tipo servicio', 'Categoría', 'Profesional', '# Ordenes UMA',
        'Descripción ítem', 'Origen', 'Cantidad', 'P. Unitario', 'Total ítem',
      ]

      const csvRows: string[][] = [headers]

      for (const orden of todasOrdenes) {
        const fecha = new Date(orden.created_at).toLocaleString('es-CO', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true,
        })
        const base = [
          fecha,
          String(orden.numero),
          orden.placa ?? '',
          orden.cliente,
          ESTADO_LABELS[orden.estado] ?? orden.estado,
          PAGO_LABELS[orden.estado_pago] ?? orden.estado_pago,
          orden.tipo_servicio ?? '',
          orden.categorias_servicio?.nombre ?? '',
          orden.usuarios?.nombre ?? '',
          (orden.numeros_orden_uma ?? []).join(' / '),
        ]
        const ordenItems = itemsMap.get(orden.id) ?? []
        if (ordenItems.length === 0) {
          csvRows.push([...base, '', '', '', '', ''])
        } else {
          for (const item of ordenItems) {
            csvRows.push([
              ...base,
              item.descripcion,
              ORIGEN_LABELS[item.origen] ?? item.origen,
              String(item.cantidad),
              String(item.precio_venta),
              String(item.precio_venta * item.cantidad),
            ])
          }
        }
      }

      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
      const csv = '﻿' + csvRows.map((r) => r.map(esc).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `servicio_tecnico_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setLoadingCSV(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Servicio Técnico</h1>
          <p className="text-sm text-gray-500">{totalOrdenes} órdenes · {gruposFiltrados.length} motos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s4.332.477 5.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Ver Manuales de Partes
          </button>
          <button
            onClick={handleDescargarCSV}
            disabled={loadingCSV || gruposFiltrados.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Descargar CSV con los datos actuales"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loadingCSV ? 'Generando...' : 'CSV'}
          </button>
          <Link
            href="/admin/ordenes/nueva"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-800"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Crear Entrada
          </Link>
        </div>
      </div>

      {(profile?.rol === 'gerencia' || profile?.rol === 'admin') && (
        <ImportadorExcel
          titulo="Carga masiva (Excel) — recuperar órdenes de un caído de plataforma"
          descripcion="Cada fila es un ítem (repuesto, mano de obra o insumo). Varias filas con la misma 'Referencia' forman una sola orden. Funciona igual que registrarla manualmente: descuenta inventario de Repuestos UMA y registra el costo de Externos en Caja."
          nombreArchivoPlantilla="plantilla_servicio_tecnico.xlsx"
          encabezados={['Referencia (la inventas tú, ej: 1)', 'Fecha de la orden (DD/MM/AAAA)', 'Placa', 'Cliente', 'Cedula', 'Celular', 'Estado (en_proceso/pendiente/pagado/finalizado)', 'Descripcion del item', 'Origen (uma/externo/mano_obra/insumo/lavado)', 'Codigo UMA (si Origen=uma)', 'Codigo externo (opcional, si Origen=externo)', 'Proveedor (opcional, si Origen=externo)', 'Metodo de pago (obligatorio si Origen=externo, insumo o lavado)', 'Cantidad', 'Costo proveedor', 'Precio de venta', 'Monto pagado (solo en la primera fila de cada orden)']}
          obligatoriedad={['si', 'si', 'si', 'si', 'no', 'no', 'si', 'condicional', 'condicional', 'condicional', 'no', 'no', 'condicional', 'no', 'no', 'no', 'no']}
          filasEjemplo={[
            ['1', '15/03/2025', 'ABC123', 'Juan Pérez', '1020304050', '3001234567', 'finalizado', 'Cambio de aceite', 'mano_obra', '', '', '', '', '1', '0', '25000', '50000'],
            ['1', '15/03/2025', 'ABC123', 'Juan Pérez', '1020304050', '3001234567', 'finalizado', 'Filtro de aceite', 'externo', '', 'FE-100', 'Repuestos del Norte', 'Efectivo', '1', '15000', '25000', ''],
            ['2', '16/03/2025', 'XYZ789', 'María Gómez', '', '3019876543', 'pendiente', 'Pastillas de freno', 'uma', 'PF-200', '', '', '', '2', '0', '40000', '80000'],
            ['3', '17/03/2025', 'JKL456', 'Carlos Ruiz', '', '', 'pagado', '', '', '', '', '', '', '', '', '', ''],
            ['4', '18/03/2025', 'MNO789', 'Pedro Sánchez', '', '', 'finalizado', 'Porta Placas', 'insumo', '', '', '', 'Efectivo', '1', '5000', '15000', '15000'],
            ['5', '18/03/2025', 'MNO789', 'Pedro Sánchez', '', '', 'finalizado', '', 'lavado', '', '', '', 'Transferencia', '1', '', '', ''],
          ]}
          notas={[
            'Lo único realmente obligatorio para crear la orden (entrada de esa moto) es: Referencia, Fecha de la orden, Placa, Cliente y Estado. Los ítems (repuestos/mano de obra/insumos) son opcionales — una Referencia sin ningún ítem igual crea la orden para esa moto, solo que sin nada cargado todavía (como la fila de ejemplo 3).',
            '¿Qué es "Referencia"? NO es algo que ya exista en el sistema ni un número de orden real — es un identificador que TÚ inventas, solo para indicarle al sistema qué filas pertenecen a la misma orden. Ejemplo: pon "1" en todas las filas del primer servicio, "2" en todas las del segundo, etc. No queda guardado en ningún lado, solo se usa al momento de importar.',
            '¿Qué fecha va en "Fecha de la orden"? La fecha real en que se hizo el servicio (puede ser una fecha pasada — para eso es esta carga masiva, para recuperar historial). No tiene que ser la fecha de hoy.',
            'Si una Referencia SÍ trae ítems: una fila = un ítem de la orden (repuesto, mano de obra, insumo o lavado). Para una orden con varios ítems, repite la misma Referencia en todas sus filas, y en esas filas adicionales deja vacíos Fecha/Placa/Cliente/Cedula/Celular/Estado/Monto pagado (solo se leen de la PRIMERA fila de cada Referencia).',
            'Si vas a agregar un ítem en una fila, ahí sí son obligatorios "Descripcion del item" y "Origen" (excepto en Origen=lavado, ver más abajo).',
            'Origen: uma, externo, mano_obra, insumo o lavado.',
            'Si Origen=uma, el Código UMA es obligatorio y debe existir en tu catálogo — con eso se descuenta el inventario igual que en el flujo manual.',
            'Si Origen=externo, el Código externo es opcional: si coincide con uno del catálogo de Externos/Propios se usa ese (con su costo); si no coincide o lo dejas vacío, se busca por el nombre exacto en "Descripcion del item" y, si tampoco existe, se crea uno nuevo en el catálogo con el Costo proveedor, Precio de venta y Proveedor que indiques.',
            'Para Porta Placas, usa Origen=insumo y escribe "Porta Placas" en Descripcion del item — es el mismo tipo que Insumos, solo cambia el nombre.',
            'Para el servicio de Lava Moto, usa Origen=lavado. No llenes Descripcion, Costo proveedor ni Precio de venta — se usa el precio y costo que ya tengas configurado para Lava Moto en el sistema. Solo necesitas Cantidad y Método de pago. Requiere tener el servicio de Lava Moto activo en Configuración, si no, esa fila dará error.',
            'Metodo de pago: obligatorio cuando Origen es externo, insumo o lavado — es necesario para que Caja sepa de qué cuenta salió o entró ese dinero. Escribe el nombre EXACTO de un método que ya exista en tu lista de Métodos de pago (ej: Efectivo, Transferencia, Datafono). No se pide para uma ni mano_obra.',
            'Estado: en_proceso, pendiente, pagado o finalizado (es obligatorio, no se puede dejar vacío).',
            'Monto pagado: si lo dejas vacío o en 0, la orden queda como "pendiente" de pago. Si es igual o mayor al total, queda "pagado". Si es menor, queda "abono".',
            'Si la Placa o la Cédula no existen todavía en el sistema, se crean automáticamente igual que al registrar una orden manualmente.',
          ]}
          vistaPrevia={(filas) => previsualizarServicioTecnico(filas, supabase, profile!.tenant_id)}
          procesarFilas={(filas) => importarServicioTecnico(supabase, profile!.tenant_id, profile!.id, filas)}
        />
      )}

      {/* Búsqueda */}
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por placa, nombre o # Orden UMA..."
        className="w-full max-w-sm px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />

      {/* Filtro: tipo de ingreso (categorías del DB) */}
      {categorias.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-500 font-medium">Tipo:</span>
          <button
            onClick={() => setFiltroCategoria('todos')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filtroCategoria === 'todos' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => { setFiltroCategoria(filtroCategoria === c.id ? 'todos' : c.id); setFiltroSubcategoria('todos') }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroCategoria === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Filtro: subcategoría (solo si la categoría seleccionada tiene subtipos) */}
      {(() => {
        const subs = categorias.find((c) => c.id === filtroCategoria)?.subcategorias_servicio ?? []
        return subs.length > 0 && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-gray-500 font-medium">Subtipo:</span>
            <button
              onClick={() => setFiltroSubcategoria('todos')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroSubcategoria === 'todos' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            {subs.map((s) => (
              <button
                key={s.id}
                onClick={() => setFiltroSubcategoria(filtroSubcategoria === s.id ? 'todos' : s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filtroSubcategoria === s.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Filtro estado */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-500 font-medium">Estado:</span>
        {([
          { value: 'todos', label: 'Todos' },
          { value: 'activos', label: 'Activos' },
          { value: 'programado', label: 'Programado' },
          { value: 'falta_revision', label: 'Falta revisión' },
          { value: 'en_proceso', label: 'En proceso' },
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'pagado', label: 'Pagado' },
          { value: 'listo', label: 'Finalizado' },
        ] as { value: FiltroEstado; label: string }[]).map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltroEstado(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filtroEstado === f.value ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <button
          onClick={() => setFiltroOrdenPendiente((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            filtroOrdenPendiente ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
          }`}
        >
          # Orden Pendiente
        </button>
      </div>

      {/* Filtro fechas */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-500 font-medium">Fechas:</span>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {(fechaDesde || fechaHasta) && (
          <button onClick={limpiarFechas} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Limpiar
          </button>
        )}
      </div>

      {/* Lista agrupada por placa */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-28 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-48" />
            </div>
          ))}
        </div>
      ) : gruposFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Sin órdenes{busqueda ? ` para "${busqueda}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gruposFiltrados.map((grupo) => {
            const servicioOrdenes = grupo.ordenes.filter(esServicio)
            const ventaOrdenes = grupo.ordenes.filter((o) => !esServicio(o))
            const ordenActual = servicioOrdenes.find(estadoActivo) ?? servicioOrdenes[0]
            return (
              <div key={grupo.placa} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Cabecera placa */}
                <button
                  onClick={() => toggleGrupo(grupo.placa)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl font-bold text-gray-900 font-mono flex-shrink-0">{grupo.placa}</span>
                    {ordenActual && ordenActual.estado_pago !== 'pagado' && (ordenActual.valor_total - (ordenActual.valor_abono ?? 0)) > 0 && (
                      <span className="text-xl font-bold text-red-600 flex-shrink-0">
                        {formatCOP(ordenActual.valor_total - (ordenActual.valor_abono ?? 0))}
                      </span>
                    )}
                    {ordenActual?.estado === 'programado' && ordenActual.fecha_programada && (
                      <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full flex-shrink-0">
                        📅 Programado: {formatFechaPlaca(ordenActual.fecha_programada)}
                      </span>
                    )}
                    <span className="text-sm text-gray-400 truncate">– {ordenActual?.cliente}</span>
                    {ordenActual && (
                      <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
                        {formatFechaPlaca(ordenActual.created_at)} · {formatCOP(ordenActual.valor_total)}
                      </span>
                    )}
                    {servicioOrdenes.length > 1 && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                        {servicioOrdenes.length}
                      </span>
                    )}
                    {ventaOrdenes.length > 0 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        {ventaOrdenes.length} venta{ventaOrdenes.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {grupo.repuestosPendientes > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0 flex items-center gap-1">
                        ⏳ {grupo.repuestosPendientes} rep. pendiente{grupo.repuestosPendientes !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* Badge tipo de ingreso del orden actual */}
                    {ordenActual?.categorias_servicio?.nombre && (() => {
                      const cat = ordenActual.categorias_servicio!.nombre
                      const esUMA = cat.toLowerCase().includes('uma')
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          esUMA ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {cat}
                        </span>
                      )
                    })()}
                    {/* Alerta si hay alguna orden UMA activa sin # de orden */}
                    {tieneOrdenUMAPendiente(grupo) && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                        # Orden Pendiente
                      </span>
                    )}
                    {/* # Orden UMA de la orden activa de servicio UMA */}
                    {(() => {
                      const umaOrden = grupo.ordenes.find(
                        (o) => o.tipo_servicio === 'uma' && o.numeros_orden_uma && o.numeros_orden_uma.length > 0
                      )
                      if (!umaOrden?.numeros_orden_uma?.length) return null
                      const nums = umaOrden.numeros_orden_uma.filter((n) => n !== 'N/A')
                      if (!nums.length) return null
                      return (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono font-medium flex-shrink-0">
                          OT: {nums.join(' / ')}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ordenActual && <OrderStatus estado={ordenActual.estado} />}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${grupo.expandido ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Órdenes expandidas */}
                {grupo.expandido && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {servicioOrdenes.map((orden) => (
                      <Link
                        key={orden.id}
                        href={`/admin/ordenes/${orden.id}`}
                        className="flex items-start justify-between px-5 py-3 hover:bg-blue-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400">#{orden.numero}</span>
                            <span className="text-sm font-medium text-gray-800">{orden.cliente}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                            {orden.usuarios?.nombre && <span>{orden.usuarios.nombre}</span>}
                            {orden.categorias_servicio?.nombre && (() => {
                              const cat = orden.categorias_servicio!.nombre
                              const esUMA = cat.toLowerCase().includes('uma')
                              return (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${
                                  esUMA ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {cat}
                                </span>
                              )
                            })()}
                            {orden.estado === 'programado' && orden.fecha_programada ? (
                              <span className="text-orange-600 font-semibold">
                                📅 Programado: {formatFechaPlaca(orden.fecha_programada)}
                                {orden.duracion_estimada_horas != null && ` · ${orden.duracion_estimada_horas}h estimadas`}
                              </span>
                            ) : (
                              <span>Entrada: {new Date(orden.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            {orden.fecha_finalizacion && (
                              <span className="text-green-600">Salida: {new Date(orden.fecha_finalizacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            <span className="font-semibold text-gray-600">Total: {formatCOP(orden.valor_total)}</span>
                            {!orden.telefono && orden.estado !== 'listo' && (
                              <span className="text-amber-500 font-medium">Sin teléfono</span>
                            )}
                          </div>
                          {/* Badge prominente si UMA sin # de orden */}
                          {(() => {
                            const cat = orden.categorias_servicio?.nombre ?? ''
                            if (!cat.toLowerCase().includes('uma') || orden.estado === 'listo') return null
                            const nums = orden.numeros_orden_uma ?? []
                            if (nums.includes('N/A') || nums.filter((n) => n !== 'N/A').length > 0) return null
                            return (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-lg">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  # de Orden Pendiente
                                </span>
                              </div>
                            )
                          })()}
                        </div>
                        <div className="flex-shrink-0 ml-3">
                          <OrderStatus estado={orden.estado} />
                        </div>
                      </Link>
                    ))}

                    {ventaOrdenes.length > 0 && (
                      <div className="bg-green-50/50">
                        <p className="px-5 pt-2.5 pb-1 text-xs font-medium text-green-700 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.102 1.101" />
                          </svg>
                          Ventas de repuestos vinculadas
                        </p>
                        {ventaOrdenes.map((venta) => (
                          <Link
                            key={venta.id}
                            href={`/admin/ordenes/${venta.id}`}
                            className="flex items-start justify-between px-5 py-2.5 hover:bg-green-50 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-400">#{venta.numero}</span>
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Venta</span>
                                <span className="text-sm font-medium text-gray-700">{venta.cliente}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                <span>{new Date(venta.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
                                {venta.valor_total > 0 && (
                                  <span className="text-green-600 font-medium">
                                    ${venta.valor_total.toLocaleString('es-CO')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 ml-3">
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Cerrada</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {manualesOpen && profile?.tenant_id && (
        <ManualesPartesModal tenantId={profile.tenant_id} onClose={() => setManualesOpen(false)} />
      )}
    </div>
  )
}
