'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

type Periodo = 'hoy' | 'semana' | 'mes' | 'rango'
type Categoria = 'ingreso_st' | 'ingreso_venta' | 'ingreso_insumo' | 'ingreso_lavado' | 'ingreso_externo' | 'costo_externo' | 'costo_lavado' | 'gasto' | 'ajuste'

interface Movimiento {
  id: string
  rawId: string
  fecha: string
  categoria: Categoria
  concepto: string
  nombre: string | null
  codigo: string | null
  monto: number // con signo: positivo = ingreso, negativo = salida
  metodoPagoId: string | null
  metodoPago: string | null
  grupo: string
}

const CATEGORIA_LABEL: Record<Categoria, string> = {
  ingreso_st:      'Ingresos Servicio Técnico',
  ingreso_venta:   'Ingresos Venta repuesto directa',
  ingreso_insumo:  'Ingresos Insumos',
  ingreso_lavado:  'Ingresos Servicio de Lavado',
  ingreso_externo: 'Ingresos repuestos Externos/Terceros',
  costo_externo:   'Costo repuestos Externos/Terceros',
  costo_lavado:    'Costo Servicio de Lavado',
  gasto:           'Gastos de Caja',
  ajuste:          'Ajuste de Caja',
}

const CATEGORIA_BADGE: Record<Categoria, string> = {
  ingreso_st:      'bg-blue-100 text-blue-700',
  ingreso_venta:   'bg-emerald-100 text-emerald-700',
  ingreso_insumo:  'bg-purple-100 text-purple-700',
  ingreso_lavado:  'bg-cyan-100 text-cyan-700',
  ingreso_externo: 'bg-teal-100 text-teal-700',
  costo_externo:   'bg-amber-100 text-amber-700',
  costo_lavado:    'bg-orange-100 text-orange-700',
  gasto:           'bg-red-100 text-red-700',
  ajuste:          'bg-gray-700 text-white',
}

function grupoOrden(ord: { numero: number; placa: string; cliente: string } | null): string {
  return ord ? `Orden #${ord.numero} (${ord.placa ?? '—'}) · ${ord.cliente ?? 'Cliente'}` : 'Sin orden asociada'
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

function NuevoGastoModal({ tenantId, usuarioId, titulo = 'Nuevo gasto de caja', descripcionInicial = '', onClose, onCreado }: {
  tenantId: string; usuarioId: string; titulo?: string; descripcionInicial?: string; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState(descripcionInicial)
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
  }, [supabase, tenantId])

  const valido = descripcion.trim() !== '' && parseInt(monto.replace(/\D/g, ''), 10) > 0 && metodoPagoId !== ''

  async function guardar() {
    if (!valido) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    try {
      const { data, error: err } = await supabase.from('gastos_caja').insert({
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: metodoPagoId,
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
        <h2 className="font-bold text-gray-900 mb-1">{titulo}</h2>
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
          <div>
            <label className="text-xs text-gray-500">Método de pago</label>
            <select value={metodoPagoId} onChange={e => setMetodoPagoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mt-0.5 bg-white">
              <option value="">Selecciona...</option>
              {metodosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
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

function EditarGastoModal({ tenantId, usuarioId, gasto, onClose, onEditado }: {
  tenantId: string; usuarioId: string
  gasto: { id: string; descripcion: string; monto: number; metodoPagoId: string | null }
  onClose: () => void; onEditado: () => void
}) {
  const supabase = createClient()
  const [monto, setMonto] = useState(String(gasto.monto))
  const [metodoPagoId, setMetodoPagoId] = useState(gasto.metodoPagoId ?? '')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
  }, [supabase, tenantId])

  const valido = parseInt(monto.replace(/\D/g, ''), 10) > 0 && metodoPagoId !== ''

  async function guardar() {
    if (!valido) return
    if (!confirm('¿Seguro que deseas editar este gasto?')) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    try {
      const { error: err } = await supabase.from('gastos_caja').update({
        monto: montoNum,
        metodo_pago_id: metodoPagoId,
      }).eq('id', gasto.id)
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'gastos_caja',
        registro_id: gasto.id,
        tipo: 'edicion',
        valor_anterior: { monto: gasto.monto, metodo_pago_id: gasto.metodoPagoId },
        valor_nuevo: { monto: montoNum, metodo_pago_id: metodoPagoId },
        descripcion: `Editó el gasto de caja "${gasto.descripcion}"`,
        usuario_id: usuarioId,
      })
      onEditado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al editar el gasto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Editar gasto de caja</h2>
        <p className="text-xs text-gray-500 mb-4">{gasto.descripcion}</p>
        <div className="space-y-2">
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
          <div>
            <label className="text-xs text-gray-500">Método de pago</label>
            <select value={metodoPagoId} onChange={e => setMetodoPagoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mt-0.5 bg-white">
              <option value="">Selecciona...</option>
              {metodosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!valido || guardando}
            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AjusteModal({ tenantId, usuarioId, onClose, onCreado }: {
  tenantId: string; usuarioId: string; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState('')
  const [signo, setSigno] = useState<'+' | '-'>('+')
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
  }, [supabase, tenantId])

  const valido = descripcion.trim() !== '' && parseInt(monto.replace(/\D/g, ''), 10) > 0 && metodoPagoId !== ''

  async function guardar() {
    if (!valido) return
    if (!confirm('¿Seguro que deseas registrar este ajuste de caja?')) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10) * (signo === '-' ? -1 : 1)
    try {
      const { data, error: err } = await supabase.from('ajustes_caja').insert({
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: metodoPagoId,
        registrado_por: usuarioId,
      }).select('id').single()
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'ajustes_caja',
        registro_id: (data as { id: string }).id,
        tipo: 'movimiento',
        valor_nuevo: { descripcion: descripcion.trim(), monto: montoNum },
        descripcion: `Registró un ajuste de caja: "${descripcion.trim()}" por ${formatCOP(montoNum)}`,
        usuario_id: usuarioId,
      })
      onCreado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar el ajuste')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Ajuste de caja</h2>
        <p className="text-xs text-gray-500 mb-4">Solo Gerencia puede registrar ajustes — queda guardado quién y cuándo lo hizo.</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500">Motivo del ajuste</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Corrección de saldo en efectivo..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Cuenta (método de pago)</label>
            <select value={metodoPagoId} onChange={e => setMetodoPagoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 mt-0.5 bg-white">
              <option value="">Selecciona...</option>
              {metodosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Monto del ajuste</label>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex p-0.5 bg-gray-100 rounded-lg">
                <button type="button" onClick={() => setSigno('+')}
                  className={`px-2.5 py-1 rounded-md text-sm font-semibold ${signo === '+' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-400'}`}>+</button>
                <button type="button" onClick={() => setSigno('-')}
                  className={`px-2.5 py-1 rounded-md text-sm font-semibold ${signo === '-' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400'}`}>−</button>
              </div>
              <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-gray-400 bg-white">
                <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-1.5">$</span>
                <input type="text" inputMode="numeric"
                  value={monto ? Number(monto.replace(/\D/g, '')).toLocaleString('es-CO') : ''}
                  onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="flex-1 px-2 py-1.5 text-sm font-mono text-right focus:outline-none" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {signo === '+' ? 'Suma este monto a la cuenta seleccionada.' : 'Resta este monto de la cuenta seleccionada.'}
            </p>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!valido || guardando}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CATEGORIAS_CON_CUENTA: Categoria[] = ['ingreso_st', 'ingreso_venta', 'gasto', 'costo_lavado', 'costo_externo', 'ajuste']

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
  const [gastoModal, setGastoModal] = useState<{ titulo: string; descripcionInicial: string } | null>(null)
  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [editGasto, setEditGasto] = useState<{ id: string; descripcion: string; monto: number; metodoPagoId: string | null } | null>(null)
  const [vistaResumen, setVistaResumen] = useState<'total' | 'cuenta'>('total')
  const [vistaTabla, setVistaTabla] = useState<'item' | 'metodo'>('item')

  const esGerencia = profile?.rol === 'gerencia'
  // Editar/eliminar gastos de caja (incluye transferencias) — Gerencia y Admin.
  // Los ajustes de caja siguen exclusivos de Gerencia (requisito explícito distinto).
  const puedeEditarGastos = esGerencia || profile?.rol === 'admin'
  const { desde, hasta } = calcularRango(periodo, desdeManual, hastaManual)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const desdeISO = `${desde}T00:00:00`
    const hastaISO = `${hasta}T23:59:59`

    const [{ data: pagos }, { data: costosExt }, { data: gastos }, { data: insumos }, { data: lavados }, { data: ventaDirecta }, { data: ajustes }] = await Promise.all([
      supabase.from('pagos_orden')
        .select('id, monto, fecha, metodo_pago_id, metodos_pago(nombre), ordenes(numero, placa, cliente, tipo_orden)')
        .eq('tenant_id', profile.tenant_id)
        .gte('fecha', desdeISO).lte('fecha', hastaISO),
      supabase.from('items_orden')
        .select('id, descripcion, costo, precio_venta, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente)')
        .eq('origen', 'externo')
        .eq('ordenes.tenant_id', profile.tenant_id)
        .or('costo.gt.0,precio_venta.gt.0')
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
      supabase.from('gastos_caja')
        .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre)')
        .eq('tenant_id', profile.tenant_id)
        .gte('fecha', desdeISO).lte('fecha', hastaISO),
      supabase.from('items_orden')
        .select('id, descripcion, precio_venta, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente)')
        .eq('origen', 'insumo')
        .eq('ordenes.tenant_id', profile.tenant_id)
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
      supabase.from('lava_moto_ordenes')
        .select('id, costo_unitario, precio_venta_unitario, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente)')
        .eq('ordenes.tenant_id', profile.tenant_id)
        .or('costo_unitario.gt.0,precio_venta_unitario.gt.0')
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
      supabase.from('ordenes')
        .select('id, numero, placa, cliente, valor_abono, metodo_pago_id, metodos_pago(nombre), created_at')
        .eq('tenant_id', profile.tenant_id)
        .eq('tipo_orden', 'venta_repuestos')
        .gt('valor_abono', 0)
        .gte('created_at', desdeISO).lte('created_at', hastaISO),
      supabase.from('ajustes_caja')
        .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre)')
        .eq('tenant_id', profile.tenant_id)
        .gte('fecha', desdeISO).lte('fecha', hastaISO),
    ])

    const lista: Movimiento[] = []

    for (const p of (pagos ?? []) as unknown as { id: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
      const ord = p.ordenes
      const esVenta = ord?.tipo_orden === 'venta_repuestos'
      lista.push({
        id: `pago_${p.id}`,
        rawId: p.id,
        fecha: p.fecha,
        categoria: esVenta ? 'ingreso_venta' : 'ingreso_st',
        concepto: `${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
        nombre: ord?.cliente ?? null,
        codigo: ord?.placa ?? null,
        monto: p.monto,
        metodoPagoId: p.metodo_pago_id,
        metodoPago: p.metodos_pago?.nombre ?? null,
        grupo: grupoOrden(ord),
      })
    }

    for (const v of (ventaDirecta ?? []) as unknown as { id: string; numero: number; placa: string; cliente: string; valor_abono: number; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; created_at: string }[]) {
      lista.push({
        id: `ventadirecta_${v.id}`,
        rawId: v.id,
        fecha: v.created_at,
        categoria: 'ingreso_venta',
        concepto: `${v.cliente ?? 'Cliente'} · Orden #${v.numero ?? '—'} (${v.placa ?? '—'})`,
        nombre: v.cliente ?? null,
        codigo: v.placa ?? null,
        monto: v.valor_abono,
        metodoPagoId: v.metodo_pago_id,
        metodoPago: v.metodos_pago?.nombre ?? null,
        grupo: grupoOrden({ numero: v.numero, placa: v.placa, cliente: v.cliente }),
      })
    }

    for (const it of (costosExt ?? []) as unknown as { id: string; descripcion: string; costo: number; precio_venta: number; cantidad: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string } | null }[]) {
      const ord = it.ordenes
      const concepto = `${it.descripcion} · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`
      if (it.costo > 0) {
        lista.push({
          id: `extcosto_${it.id}`,
          rawId: it.id,
          fecha: it.created_at,
          categoria: 'costo_externo',
          concepto,
          nombre: it.descripcion,
          codigo: ord?.placa ?? null,
          monto: -(it.costo * it.cantidad),
          metodoPagoId: it.metodo_pago_id,
          metodoPago: it.metodos_pago?.nombre ?? null,
          grupo: grupoOrden(ord),
        })
      }
      if (it.precio_venta > 0) {
        lista.push({
          id: `extingreso_${it.id}`,
          rawId: it.id,
          fecha: it.created_at,
          categoria: 'ingreso_externo',
          concepto,
          nombre: it.descripcion,
          codigo: ord?.placa ?? null,
          monto: it.precio_venta * it.cantidad,
          metodoPagoId: it.metodo_pago_id,
          metodoPago: it.metodos_pago?.nombre ?? null,
          grupo: grupoOrden(ord),
        })
      }
    }

    for (const lm of (lavados ?? []) as unknown as { id: string; costo_unitario: number; precio_venta_unitario: number; cantidad: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string } | null }[]) {
      const ord = lm.ordenes
      const concepto = `Servicio de lavado · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`
      if (lm.costo_unitario > 0) {
        lista.push({
          id: `lavadocosto_${lm.id}`,
          rawId: lm.id,
          fecha: lm.created_at,
          categoria: 'costo_lavado',
          concepto,
          nombre: 'Servicio de lavado',
          codigo: ord?.placa ?? null,
          monto: -(lm.costo_unitario * lm.cantidad),
          metodoPagoId: lm.metodo_pago_id,
          metodoPago: lm.metodos_pago?.nombre ?? null,
          grupo: grupoOrden(ord),
        })
      }
      if (lm.precio_venta_unitario > 0) {
        lista.push({
          id: `lavadoingreso_${lm.id}`,
          rawId: lm.id,
          fecha: lm.created_at,
          categoria: 'ingreso_lavado',
          concepto,
          nombre: 'Servicio de lavado',
          codigo: ord?.placa ?? null,
          monto: lm.precio_venta_unitario * lm.cantidad,
          metodoPagoId: null,
          metodoPago: null,
          grupo: grupoOrden(ord),
        })
      }
    }

    for (const g of (gastos ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null }[]) {
      lista.push({
        id: `gasto_${g.id}`,
        rawId: g.id,
        fecha: g.fecha,
        categoria: 'gasto',
        concepto: g.descripcion,
        nombre: g.descripcion,
        codigo: null,
        monto: -g.monto,
        metodoPagoId: g.metodo_pago_id,
        metodoPago: g.metodos_pago?.nombre ?? null,
        grupo: CATEGORIA_LABEL.gasto,
      })
    }

    for (const it of (insumos ?? []) as unknown as { id: string; descripcion: string; precio_venta: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string } | null }[]) {
      const ord = it.ordenes
      lista.push({
        id: `insumo_${it.id}`,
        rawId: it.id,
        fecha: it.created_at,
        categoria: 'ingreso_insumo',
        concepto: `${it.descripcion} · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
        nombre: ord?.cliente ?? null,
        codigo: ord?.placa ?? null,
        monto: it.precio_venta,
        metodoPagoId: it.metodo_pago_id,
        metodoPago: it.metodos_pago?.nombre ?? null,
        grupo: grupoOrden(ord),
      })
    }

    for (const a of (ajustes ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null }[]) {
      lista.push({
        id: `ajuste_${a.id}`,
        rawId: a.id,
        fecha: a.fecha,
        categoria: 'ajuste',
        concepto: a.descripcion,
        nombre: a.descripcion,
        codigo: null,
        monto: a.monto,
        metodoPagoId: a.metodo_pago_id,
        metodoPago: a.metodos_pago?.nombre ?? null,
        grupo: CATEGORIA_LABEL.ajuste,
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

  const cuentas = useMemo(() => {
    const mapa = new Map<string, { nombre: string; ingreso: number; egreso: number }>()
    for (const m of movimientos) {
      if (!CATEGORIAS_CON_CUENTA.includes(m.categoria)) continue
      const key = m.metodoPagoId ?? 'sin_metodo'
      const nombre = m.metodoPago ?? 'Sin método especificado'
      if (!mapa.has(key)) mapa.set(key, { nombre, ingreso: 0, egreso: 0 })
      const c = mapa.get(key)!
      if (m.monto >= 0) c.ingreso += m.monto
      else c.egreso += Math.abs(m.monto)
    }
    return [...mapa.values()].sort((a, b) => (b.ingreso - b.egreso) - (a.ingreso - a.egreso))
  }, [movimientos])

  /* Vista "Por método de pago": una fila por (orden, categoría, método) — si un mismo
     servicio técnico se pagó con 2 métodos distintos, se repite una fila por cada uno
     con el monto que le corresponde. Lo que no pertenece a una orden (ej. Gastos de
     Caja) no se agrupa, queda una fila por movimiento. */
  interface FilaMetodo {
    key: string; rawId: string; fecha: string; categoria: Categoria
    concepto: string; metodoPago: string | null; metodoPagoId: string | null; monto: number
  }
  const filasPorMetodo = useMemo(() => {
    const mapa = new Map<string, FilaMetodo>()
    for (const m of filtrados) {
      const esOrden = m.grupo.startsWith('Orden #')
      const key = esOrden ? `${m.grupo}|${m.categoria}|${m.metodoPagoId ?? ''}` : `item_${m.id}`
      const existente = mapa.get(key)
      if (existente) {
        existente.monto += m.monto
        if (m.fecha > existente.fecha) existente.fecha = m.fecha
      } else {
        mapa.set(key, {
          key,
          rawId: m.rawId,
          fecha: m.fecha,
          categoria: m.categoria,
          concepto: esOrden ? m.grupo : m.concepto,
          metodoPago: m.metodoPago,
          metodoPagoId: m.metodoPagoId,
          monto: m.monto,
        })
      }
    }
    return [...mapa.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [filtrados])

  const totalIngresos = movimientos
    .filter(m => m.categoria === 'ingreso_st' || m.categoria === 'ingreso_venta' || m.categoria === 'ingreso_insumo' || m.categoria === 'ingreso_lavado' || m.categoria === 'ingreso_externo')
    .reduce((s, m) => s + m.monto, 0)
  const totalGastos = movimientos
    .filter(m => m.categoria === 'costo_externo' || m.categoria === 'costo_lavado' || m.categoria === 'gasto')
    .reduce((s, m) => s + Math.abs(m.monto), 0)
  const totalAjustes = movimientos
    .filter(m => m.categoria === 'ajuste')
    .reduce((s, m) => s + m.monto, 0)
  const montoEnCaja = totalIngresos - totalGastos + totalAjustes

  async function eliminarGasto(m: { rawId: string; concepto: string; monto: number }) {
    if (!confirm(`¿Eliminar "${m.concepto}" por ${formatCOP(Math.abs(m.monto))}?`)) return
    const { error } = await supabase.from('gastos_caja').delete().eq('id', m.rawId)
    if (error) { alert(`No se pudo eliminar: ${error.message}`); return }
    await registrarAuditoria(supabase, {
      tenant_id: profile!.tenant_id,
      tabla: 'gastos_caja',
      registro_id: m.rawId,
      tipo: 'eliminacion',
      valor_anterior: { descripcion: m.concepto, monto: Math.abs(m.monto) },
      descripcion: `Eliminó el gasto de caja "${m.concepto}"`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  async function eliminarAjuste(m: { rawId: string; concepto: string; monto: number }) {
    if (!confirm(`¿Eliminar el ajuste "${m.concepto}" por ${formatCOP(m.monto)}?`)) return
    const { error } = await supabase.from('ajustes_caja').delete().eq('id', m.rawId)
    if (error) { alert(`No se pudo eliminar: ${error.message}`); return }
    await registrarAuditoria(supabase, {
      tenant_id: profile!.tenant_id,
      tabla: 'ajustes_caja',
      registro_id: m.rawId,
      tipo: 'eliminacion',
      valor_anterior: { descripcion: m.concepto, monto: m.monto },
      descripcion: `Eliminó el ajuste de caja "${m.concepto}"`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {gastoModal && profile?.tenant_id && profile?.id && (
        <NuevoGastoModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          titulo={gastoModal.titulo}
          descripcionInicial={gastoModal.descripcionInicial}
          onClose={() => setGastoModal(null)}
          onCreado={cargar}
        />
      )}

      {ajusteOpen && profile?.tenant_id && profile?.id && (
        <AjusteModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          onClose={() => setAjusteOpen(false)}
          onCreado={cargar}
        />
      )}

      {editGasto && profile?.tenant_id && profile?.id && (
        <EditarGastoModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          gasto={editGasto}
          onClose={() => setEditGasto(null)}
          onEditado={cargar}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
          <p className="text-sm text-gray-500 mt-1">
            Entradas y salidas de dinero de Servicio Técnico y Repuestos.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setGastoModal({ titulo: 'Nuevo gasto de caja', descripcionInicial: '' })}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors">
            + Nuevo gasto
          </button>
          <button onClick={() => setGastoModal({ titulo: 'Transferir a profesional', descripcionInicial: 'Transferencia a profesional' })}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition-colors">
            Transferir a profesional
          </button>
          <button onClick={() => setGastoModal({ titulo: 'Transferir a caja fuerte', descripcionInicial: 'Transferencia a caja fuerte' })}
            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors">
            Transferir a caja fuerte
          </button>
          {esGerencia && (
            <button onClick={() => setAjusteOpen(true)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-semibold transition-colors">
              + Ajuste
            </button>
          )}
        </div>
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {([
            { id: 'total', label: 'Total' },
            { id: 'cuenta', label: 'Por cuenta' },
          ] as { id: 'total' | 'cuenta'; label: string }[]).map(v => (
            <button key={v.id} onClick={() => setVistaResumen(v.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                vistaResumen === v.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
        {vistaResumen === 'cuenta' && (
          <p className="text-xs text-gray-400">
            Solo incluye movimientos con método de pago asociado (pagos de clientes, gastos de caja, costo de lavado y costo de repuestos externos).
          </p>
        )}
      </div>

      {vistaResumen === 'total' && (
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
      )}

      {vistaResumen === 'cuenta' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cuentas.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full text-center py-6">Sin movimientos en este período</p>
          )}
          {cuentas.map((c) => (
            <div key={c.nombre} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-400 mb-1">{c.nombre}</p>
              <p className={`text-2xl font-bold font-mono ${c.ingreso - c.egreso >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCOP(c.ingreso - c.egreso)}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                <span>Ingreso: <span className="text-emerald-700 font-semibold">{formatCOP(c.ingreso)}</span></span>
                <span>Gasto: <span className="text-red-600 font-semibold">{formatCOP(c.egreso)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

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
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {([
            { id: 'item', label: 'Por ítem' },
            { id: 'metodo', label: 'Por método de pago' },
          ] as { id: 'item' | 'metodo'; label: string }[]).map(v => (
            <button key={v.id} onClick={() => setVistaTabla(v.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                vistaTabla === v.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de movimientos: por ítem */}
      {vistaTabla === 'item' && (
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Concepto</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Monto</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">Cargando...</td></tr>
              )}
              {!loading && filtrados.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">Sin movimientos en este período</td></tr>
              )}
              {!loading && filtrados.map((m, i) => (
                <tr key={m.id} className={`border-b border-gray-100 ${m.categoria === 'ajuste' ? 'bg-gray-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(m.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORIA_BADGE[m.categoria]}`}>
                      {CATEGORIA_LABEL[m.categoria]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 truncate max-w-[280px]">{m.concepto}</td>
                  <td className={`px-4 py-3 text-right font-semibold font-mono whitespace-nowrap ${
                    m.categoria === 'ajuste' ? 'text-gray-700' : m.monto >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {m.monto >= 0 ? '+' : ''}{formatCOP(m.monto)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    {m.categoria === 'gasto' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditGasto({ id: m.rawId, descripcion: m.concepto, monto: Math.abs(m.monto), metodoPagoId: m.metodoPagoId })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminarGasto(m)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                    {m.categoria === 'ajuste' && esGerencia && (
                      <button onClick={() => eliminarAjuste(m)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lista de movimientos: por método de pago — una fila por (orden, categoría, método) */}
      {vistaTabla === 'metodo' && (
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Concepto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Método</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Monto</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Cargando...</td></tr>
              )}
              {!loading && filasPorMetodo.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Sin movimientos en este período</td></tr>
              )}
              {!loading && filasPorMetodo.map((f, i) => (
                <tr key={f.key} className={`border-b border-gray-100 ${f.categoria === 'ajuste' ? 'bg-gray-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(f.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORIA_BADGE[f.categoria]}`}>
                      {CATEGORIA_LABEL[f.categoria]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 truncate max-w-[280px]">{f.concepto}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{f.metodoPago ?? 'Sin método especificado'}</td>
                  <td className={`px-4 py-3 text-right font-semibold font-mono whitespace-nowrap ${
                    f.categoria === 'ajuste' ? 'text-gray-700' : f.monto >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {f.monto >= 0 ? '+' : ''}{formatCOP(f.monto)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    {f.categoria === 'gasto' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditGasto({ id: f.rawId, descripcion: f.concepto, monto: Math.abs(f.monto), metodoPagoId: f.metodoPagoId })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminarGasto(f)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                    {f.categoria === 'ajuste' && esGerencia && (
                      <button onClick={() => eliminarAjuste(f)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
