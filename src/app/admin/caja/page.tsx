'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

type Periodo = 'hoy' | 'semana' | 'mes' | 'rango'
type Categoria = 'ingreso_st' | 'ingreso_venta' | 'ingreso_insumo' | 'costo_externo' | 'gasto'

interface Movimiento {
  id: string
  fecha: string
  categoria: Categoria
  concepto: string
  nombre: string | null
  codigo: string | null
  monto: number // con signo: positivo = ingreso, negativo = salida
}

const CATEGORIA_LABEL: Record<Categoria, string> = {
  ingreso_st:     'Ingresos Servicio Técnico',
  ingreso_venta:  'Ingresos Venta repuesto directa',
  ingreso_insumo: 'Ingresos Insumos',
  costo_externo:  'Costo repuestos Externos/Terceros',
  gasto:          'Gastos de Caja',
}

const CATEGORIA_BADGE: Record<Categoria, string> = {
  ingreso_st:     'bg-blue-100 text-blue-700',
  ingreso_venta:  'bg-emerald-100 text-emerald-700',
  ingreso_insumo: 'bg-purple-100 text-purple-700',
  costo_externo:  'bg-amber-100 text-amber-700',
  gasto:          'bg-red-100 text-red-700',
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function calcularRango(periodo: Periodo, desdeManual: string, hastaManual: string): { desde: string; hasta: string } {
  const hoy = new Date()
  const hastaHoy = ymdLocal(hoy)
  if (periodo === 'hoy') return { desde: hastaHoy, hasta: hastaHoy }
  if (periodo === 'semana') {
    const diaSemana = (hoy.getDay() + 6) % 7 // lunes = 0
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - diaSemana)
    return { desde: ymdLocal(lunes), hasta: hastaHoy }
  }
  if (periodo === 'mes') {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    return { desde: ymdLocal(primero), hasta: hastaHoy }
  }
  return { desde: desdeManual || hastaHoy, hasta: hastaManual || hastaHoy }
}

function NuevoGastoModal({ tenantId, usuarioId, onClose, onCreado }: {
  tenantId: string; usuarioId: string; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const valido = descripcion.trim() !== '' && parseInt(monto.replace(/\D/g, ''), 10) > 0

  async function guardar() {
    if (!valido) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    try {
      const { data, error: err } = await supabase.from('gastos_caja').insert({
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        registrado_por: usuarioId,
      }).select('id').single()
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'gastos_caja',
        registro_id: (data as { id: string }).id,
        tipo: 'movimiento',
        valor_nuevo: { descripcion: descripcion.trim(), monto: montoNum },
        descripcion: `Registró un gasto de caja: "${descripcion.trim()}" por ${formatCOP(montoNum)}`,
        usuario_id: usuarioId,
      })
      onCreado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar el gasto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Nuevo gasto de caja</h2>
        <p className="text-xs text-gray-500 mb-4">Se registra con la fecha de hoy.</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Pago de servicios, papelería..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Monto</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-red-400 bg-white mt-0.5">
              <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-1.5">$</span>
              <input type="text" inputMode="numeric"
                value={monto ? Number(monto.replace(/\D/g, '')).toLocaleString('es-CO') : ''}
                onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="flex-1 px-2 py-1.5 text-sm font-mono text-right focus:outline-none" />
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!valido || guardando}
            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CajaPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [desdeManual, setDesdeManual] = useState(ymdLocal(new Date()))
  const [hastaManual, setHastaManual] = useState(ymdLocal(new Date()))
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [catFiltro, setCatFiltro] = useState<Categoria | 'todos'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [nuevoGastoOpen, setNuevoGastoOpen] = useState(false)

  const { desde, hasta } = calcularRango(periodo, desdeManual, hastaManual)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const desdeISO = `${desde}T00:00:00`
    const hastaISO = `${hasta}T23:59:59`

    const [{ data: pagos }, { data: movs }, { data: gastos }, { data: insumos }] = await Promise.all([
      supabase.from('pagos_orden')
        .select('id, monto, fecha, ordenes(numero, placa, cliente, tipo_orden)')
        .eq('tenant_id', profile.tenant_id)
        .gte('fecha', desdeISO).lte('fecha', hastaISO),
      supabase.from('movimientos_inventario')
        .select('id, costo_unitario, cantidad, created_at, proveedor, repuestos_externos(nombre, codigo)')
        .eq('tenant_id', profile.tenant_id)
        .eq('tipo', 'salida')
        .not('repuesto_externo_id', 'is', null)
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
      supabase.from('gastos_caja')
        .select('id, descripcion, monto, fecha')
        .eq('tenant_id', profile.tenant_id)
        .gte('fecha', desdeISO).lte('fecha', hastaISO),
      supabase.from('items_orden')
        .select('id, precio_venta, created_at, ordenes!inner(tenant_id, numero, placa, cliente)')
        .eq('origen', 'insumo')
        .eq('ordenes.tenant_id', profile.tenant_id)
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
    ])

    const lista: Movimiento[] = []

    for (const p of (pagos ?? []) as unknown as { id: string; monto: number; fecha: string; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
      const ord = p.ordenes
      const esVenta = ord?.tipo_orden === 'venta_repuestos'
      lista.push({
        id: `pago_${p.id}`,
        fecha: p.fecha,
        categoria: esVenta ? 'ingreso_venta' : 'ingreso_st',
        concepto: `${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
        nombre: ord?.cliente ?? null,
        codigo: ord?.placa ?? null,
        monto: p.monto,
      })
    }

    for (const m of (movs ?? []) as unknown as { id: string; costo_unitario: number | null; cantidad: number; created_at: string; proveedor: string | null; repuestos_externos: { nombre: string; codigo: string | null } | null }[]) {
      const costo = (m.costo_unitario ?? 0) * (m.cantidad ?? 1)
      lista.push({
        id: `mov_${m.id}`,
        fecha: m.created_at,
        categoria: 'costo_externo',
        concepto: m.repuestos_externos?.nombre ?? m.proveedor ?? 'Repuesto externo',
        nombre: m.repuestos_externos?.nombre ?? null,
        codigo: m.repuestos_externos?.codigo ?? null,
        monto: -costo,
      })
    }

    for (const g of (gastos ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string }[]) {
      lista.push({
        id: `gasto_${g.id}`,
        fecha: g.fecha,
        categoria: 'gasto',
        concepto: g.descripcion,
        nombre: g.descripcion,
        codigo: null,
        monto: -g.monto,
      })
    }

    for (const it of (insumos ?? []) as unknown as { id: string; precio_venta: number; created_at: string; ordenes: { numero: number; placa: string; cliente: string } | null }[]) {
      const ord = it.ordenes
      lista.push({
        id: `insumo_${it.id}`,
        fecha: it.created_at,
        categoria: 'ingreso_insumo',
        concepto: `Insumos · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
        nombre: ord?.cliente ?? null,
        codigo: ord?.placa ?? null,
        monto: it.precio_venta,
      })
    }

    lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
    setMovimientos(lista)
    setLoading(false)
  }, [profile?.tenant_id, desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => {
    let r = movimientos
    if (catFiltro !== 'todos') r = r.filter(m => m.categoria === catFiltro)
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      r = r.filter(m =>
        m.concepto.toLowerCase().includes(q) ||
        (m.nombre ?? '').toLowerCase().includes(q) ||
        (m.codigo ?? '').toLowerCase().includes(q)
      )
    }
    return r
  }, [movimientos, catFiltro, busqueda])

  const totalIngresos = movimientos
    .filter(m => m.categoria === 'ingreso_st' || m.categoria === 'ingreso_venta' || m.categoria === 'ingreso_insumo')
    .reduce((s, m) => s + m.monto, 0)
  const totalGastos = movimientos
    .filter(m => m.categoria === 'costo_externo' || m.categoria === 'gasto')
    .reduce((s, m) => s + Math.abs(m.monto), 0)
  const montoEnCaja = totalIngresos - totalGastos

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {nuevoGastoOpen && profile?.tenant_id && profile?.id && (
        <NuevoGastoModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          onClose={() => setNuevoGastoOpen(false)}
          onCreado={cargar}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
          <p className="text-sm text-gray-500 mt-1">
            Entradas y salidas de dinero de Servicio Técnico y Repuestos.
          </p>
        </div>
        <button onClick={() => setNuevoGastoOpen(true)}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors">
          + Nuevo gasto
        </button>
      </div>

      {/* Selector de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {([
            { id: 'hoy', label: 'Hoy' },
            { id: 'semana', label: 'Esta semana' },
            { id: 'mes', label: 'Este mes' },
            { id: 'rango', label: 'Rango' },
          ] as { id: Periodo; label: string }[]).map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodo === p.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'rango' && (
          <div className="flex items-center gap-2">
            <input type="date" value={desdeManual} onChange={e => setDesdeManual(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <span className="text-gray-400 text-sm">a</span>
            <input type="date" value={hastaManual} onChange={e => setHastaManual(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        )}
        {periodo !== 'rango' && (
          <p className="text-xs text-gray-400">
            {desde === hasta ? desde : `${desde} → ${hasta}`}
          </p>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Monto en caja (del período)</p>
          <p className={`text-2xl font-bold font-mono ${montoEnCaja >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatCOP(montoEnCaja)}
          </p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
          <p className="text-xs text-emerald-600 mb-1">Ingreso del período</p>
          <p className="text-2xl font-bold font-mono text-emerald-700">{formatCOP(totalIngresos)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-5">
          <p className="text-xs text-red-500 mb-1">Gasto del período</p>
          <p className="text-2xl font-bold font-mono text-red-700">{formatCOP(totalGastos)}</p>
        </div>
      </div>

      {/* Filtros de lista */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, descripción o código..."
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value as Categoria | 'todos')}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="todos">Todas las categorías</option>
          {Object.entries(CATEGORIA_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>

      {/* Lista de movimientos */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Categoría</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Concepto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Monto</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">Cargando...</td></tr>
            )}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">Sin movimientos en este período</td></tr>
            )}
            {!loading && filtrados.map((m, i) => (
              <tr key={m.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(m.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORIA_BADGE[m.categoria]}`}>
                    {CATEGORIA_LABEL[m.categoria]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-900 truncate max-w-[280px]">{m.concepto}</td>
                <td className={`px-4 py-3 text-right font-semibold font-mono whitespace-nowrap ${m.monto >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {m.monto >= 0 ? '+' : ''}{formatCOP(m.monto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
