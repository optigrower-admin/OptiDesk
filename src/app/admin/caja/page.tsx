'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'
import PlanillaWorldOfficeModal from '@/components/PlanillaWorldOfficeModal'
import RegistroCierresModal from './RegistroCierresModal'
import {
  type Categoria, type Movimiento, CATEGORIA_LABEL, CATEGORIAS_CON_CUENTA,
  TRANSFERENCIA_CAJA_FUERTE, esTransferenciaConcepto, grupoOrden, construirMovimientos,
} from '@/lib/caja/movimientos'

type Periodo = 'hoy' | 'semana' | 'mes' | 'rango'
type FiltroGrupo = 'todos' | 'servicios_tecnicos' | 'venta_repuestos' | 'ingreso_caja' | 'gastos_caja' | 'transferencias' | 'ajuste_caja' | 'costos_externos' | 'costos_lavado' | 'porta_placas' | 'pago_colaborador'
type FiltroMetodo = 'todos' | 'efectivo' | 'nequi' | 'caja_fuerte'

const FILTROS_METODO: { id: FiltroMetodo; label: string; color: string; activeColor: string }[] = [
  { id: 'todos',       label: 'Todas las cuentas', color: 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',          activeColor: 'bg-gray-700 text-white border-gray-700' },
  { id: 'efectivo',    label: '💵 Efectivo',        color: 'bg-white text-green-700 border-green-200 hover:border-green-500',       activeColor: 'bg-green-600 text-white border-green-600' },
  { id: 'nequi',       label: '📲 Nequi',           color: 'bg-white text-yellow-700 border-yellow-300 hover:border-yellow-500',    activeColor: 'bg-yellow-500 text-white border-yellow-500' },
  { id: 'caja_fuerte', label: '🔒 Caja Fuerte',     color: 'bg-white text-gray-600 border-gray-300 hover:border-gray-500',         activeColor: 'bg-gray-500 text-white border-gray-500' },
]

const FILTROS_GRUPO: { id: FiltroGrupo; label: string }[] = [
  { id: 'todos',              label: 'Todos' },
  { id: 'servicios_tecnicos', label: 'Servicios Técnicos' },
  { id: 'venta_repuestos',    label: 'Venta Repuestos' },
  { id: 'porta_placas',       label: 'Porta Placas' },
  { id: 'ingreso_caja',       label: 'Ingreso a Caja' },
  { id: 'gastos_caja',        label: 'Gastos de Caja' },
  { id: 'costos_externos',    label: 'Costo Ext./Terceros' },
  { id: 'costos_lavado',      label: 'Costo Serv. Lavado' },
  { id: 'transferencias',     label: 'Transferencias' },
  { id: 'ajuste_caja',        label: 'Ajuste de Caja' },
  { id: 'pago_colaborador',   label: 'Pago Colaborador' },
]

const CATEGORIA_BADGE: Record<Categoria, string> = {
  ingreso_st:      'bg-blue-100 text-blue-700',
  ingreso_venta:   'bg-emerald-100 text-emerald-700',
  ingreso_insumo:  'bg-purple-100 text-purple-700',
  ingreso_lavado:  'bg-cyan-100 text-cyan-700',
  ingreso_externo: 'bg-teal-100 text-teal-700',
  ingreso_manual:  'bg-lime-100 text-lime-700',
  costo_externo:   'bg-amber-100 text-amber-700',
  costo_lavado:    'bg-teal-200 text-teal-800',
  pago_proveedor:  'bg-amber-200 text-amber-800',
  gasto:           'bg-red-100 text-red-700',
  ajuste:          'bg-gray-700 text-white',
  porta_placas:    'bg-orange-100 text-orange-700',
  pago_colaborador: 'bg-fuchsia-100 text-fuchsia-700',
}

function colorCuenta(nombre: string): { bg: string; border: string } {
  const n = nombre.trim().toLowerCase()
  if (n === 'nequi') return { bg: 'bg-yellow-50', border: 'border-yellow-200' }
  if (n === 'efectivo') return { bg: 'bg-green-50', border: 'border-green-200' }
  if (n === 'caja fuerte') return { bg: 'bg-gray-100', border: 'border-gray-300' }
  return { bg: 'bg-white', border: 'border-gray-200' }
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatFechaCorta(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function etiquetaPeriodo(periodo: Periodo, desde: string, hasta: string): string {
  if (periodo === 'hoy') return 'de hoy'
  if (periodo === 'semana') return 'de la semana'
  if (periodo === 'mes') return 'del mes'
  return `desde ${formatFechaCorta(desde)} hasta ${formatFechaCorta(hasta)}`
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

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${da}T${h}:${mi}`
}

function nowDatetimeLocal(): string {
  return isoToDatetimeLocal(new Date().toISOString())
}

function NuevoGastoModal({ tenantId, usuarioId, titulo = 'Nuevo gasto de caja', descripcionInicial = '', esGerencia = false, onClose, onCreado }: {
  tenantId: string; usuarioId: string; titulo?: string; descripcionInicial?: string; esGerencia?: boolean
  onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState(descripcionInicial)
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [fecha, setFecha] = useState(nowDatetimeLocal())
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
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: metodoPagoId,
        registrado_por: usuarioId,
      }
      if (esGerencia && fecha) payload.fecha = new Date(fecha).toISOString()
      const { data, error: err } = await supabase.from('gastos_caja').insert(payload).select('id').single()
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'gastos_caja',
        registro_id: (data as { id: string }).id,
        tipo: 'movimiento',
        valor_nuevo: { descripcion: descripcion.trim(), monto: montoNum, ...(esGerencia && fecha ? { fecha: new Date(fecha).toISOString() } : {}) },
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
        {!esGerencia && <p className="text-xs text-gray-500 mb-4">Se registra con la fecha de hoy.</p>}
        <div className="space-y-2">
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
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

function EditarGastoModal({ tenantId, usuarioId, gasto, esGerencia = false, onClose, onEditado }: {
  tenantId: string; usuarioId: string; esGerencia?: boolean
  gasto: { id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string }
  onClose: () => void; onEditado: () => void
}) {
  const supabase = createClient()
  const [monto, setMonto] = useState(String(gasto.monto))
  const [metodoPagoId, setMetodoPagoId] = useState(gasto.metodoPagoId ?? '')
  const [fecha, setFecha] = useState(isoToDatetimeLocal(gasto.fecha))
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
    const nuevaFechaISO = esGerencia && fecha ? new Date(fecha).toISOString() : gasto.fecha
    try {
      const updatePayload: Record<string, unknown> = { monto: montoNum, metodo_pago_id: metodoPagoId }
      if (esGerencia && fecha) updatePayload.fecha = nuevaFechaISO
      const { error: err } = await supabase.from('gastos_caja').update(updatePayload).eq('id', gasto.id)
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'gastos_caja',
        registro_id: gasto.id,
        tipo: 'edicion',
        valor_anterior: { monto: gasto.monto, metodo_pago_id: gasto.metodoPagoId, fecha: gasto.fecha },
        valor_nuevo: { monto: montoNum, metodo_pago_id: metodoPagoId, fecha: nuevaFechaISO },
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
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
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

function NuevoIngresoModal({ tenantId, usuarioId, esGerencia = false, onClose, onCreado }: {
  tenantId: string; usuarioId: string; esGerencia?: boolean; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [fecha, setFecha] = useState(nowDatetimeLocal())
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
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: metodoPagoId,
        registrado_por: usuarioId,
      }
      if (esGerencia && fecha) payload.fecha = new Date(fecha).toISOString()
      const { data, error: err } = await supabase.from('ingresos_caja').insert(payload).select('id').single()
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'ingresos_caja',
        registro_id: (data as { id: string }).id,
        tipo: 'movimiento',
        valor_nuevo: { descripcion: descripcion.trim(), monto: montoNum, ...(esGerencia && fecha ? { fecha: new Date(fecha).toISOString() } : {}) },
        descripcion: `Registró un ingreso a caja: "${descripcion.trim()}" por ${formatCOP(montoNum)}`,
        usuario_id: usuarioId,
      })
      onCreado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar el ingreso')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Ingreso a caja</h2>
        {!esGerencia && <p className="text-xs text-gray-500 mb-4">Se registra con la fecha de hoy.</p>}
        <div className="space-y-2">
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Préstamo, capital, devolución..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Monto</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400 bg-white mt-0.5">
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
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 mt-0.5 bg-white">
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
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar ingreso'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditarIngresoModal({ tenantId, usuarioId, ingreso, esGerencia = false, onClose, onEditado }: {
  tenantId: string; usuarioId: string; esGerencia?: boolean
  ingreso: { id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string }
  onClose: () => void; onEditado: () => void
}) {
  const supabase = createClient()
  const [monto, setMonto] = useState(String(ingreso.monto))
  const [metodoPagoId, setMetodoPagoId] = useState(ingreso.metodoPagoId ?? '')
  const [fecha, setFecha] = useState(isoToDatetimeLocal(ingreso.fecha))
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
    if (!confirm('¿Seguro que deseas editar este ingreso?')) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    const nuevaFechaISO = esGerencia && fecha ? new Date(fecha).toISOString() : ingreso.fecha
    try {
      const updatePayload: Record<string, unknown> = { monto: montoNum, metodo_pago_id: metodoPagoId }
      if (esGerencia && fecha) updatePayload.fecha = nuevaFechaISO
      const { error: err } = await supabase.from('ingresos_caja').update(updatePayload).eq('id', ingreso.id)
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'ingresos_caja',
        registro_id: ingreso.id,
        tipo: 'edicion',
        valor_anterior: { monto: ingreso.monto, metodo_pago_id: ingreso.metodoPagoId, fecha: ingreso.fecha },
        valor_nuevo: { monto: montoNum, metodo_pago_id: metodoPagoId, fecha: nuevaFechaISO },
        descripcion: `Editó el ingreso de caja "${ingreso.descripcion}"`,
        usuario_id: usuarioId,
      })
      onEditado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al editar el ingreso')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Editar ingreso de caja</h2>
        <p className="text-xs text-gray-500 mb-4">{ingreso.descripcion}</p>
        <div className="space-y-2">
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Monto</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400 bg-white mt-0.5">
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
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 mt-0.5 bg-white">
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
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NuevoPagoColaboradorModal({ tenantId, usuarioId, esGerencia = false, onClose, onCreado }: {
  tenantId: string; usuarioId: string; esGerencia?: boolean; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [usuarioPagadoId, setUsuarioPagadoId] = useState('')
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([])
  const [fecha, setFecha] = useState(nowDatetimeLocal())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
    supabase.from('usuarios').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setUsuarios((data as { id: string; nombre: string }[]) ?? []))
  }, [supabase, tenantId])

  const valido = descripcion.trim() !== '' && parseInt(monto.replace(/\D/g, ''), 10) > 0 && metodoPagoId !== '' && usuarioPagadoId !== ''

  async function guardar() {
    if (!valido) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    const colaborador = usuarios.find(u => u.id === usuarioPagadoId)?.nombre ?? ''
    try {
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: metodoPagoId,
        usuario_pagado_id: usuarioPagadoId,
        registrado_por: usuarioId,
      }
      if (esGerencia && fecha) payload.fecha = new Date(fecha).toISOString()
      const { data, error: err } = await supabase.from('pagos_colaborador_caja').insert(payload).select('id').single()
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'pagos_colaborador_caja',
        registro_id: (data as { id: string }).id,
        tipo: 'movimiento',
        valor_nuevo: { descripcion: descripcion.trim(), monto: montoNum, usuario_pagado_id: usuarioPagadoId, ...(esGerencia && fecha ? { fecha: new Date(fecha).toISOString() } : {}) },
        descripcion: `Registró un pago a colaborador (${colaborador}): "${descripcion.trim()}" por ${formatCOP(montoNum)}`,
        usuario_id: usuarioId,
      })
      onCreado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar el pago')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Nuevo pago a colaborador</h2>
        {!esGerencia && <p className="text-xs text-gray-500 mb-4">Se registra con la fecha de hoy.</p>}
        <div className="space-y-2">
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Colaborador</label>
            <select value={usuarioPagadoId} onChange={e => setUsuarioPagadoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400 mt-0.5 bg-white">
              <option value="">Selecciona...</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Concepto</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Comisión, préstamo, bono..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Monto</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-fuchsia-400 bg-white mt-0.5">
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
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400 mt-0.5 bg-white">
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
            className="flex-1 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditarPagoColaboradorModal({ tenantId, usuarioId, pago, esGerencia = false, onClose, onEditado }: {
  tenantId: string; usuarioId: string; esGerencia?: boolean
  pago: { id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string }
  onClose: () => void; onEditado: () => void
}) {
  const supabase = createClient()
  const [monto, setMonto] = useState(String(pago.monto))
  const [metodoPagoId, setMetodoPagoId] = useState(pago.metodoPagoId ?? '')
  const [fecha, setFecha] = useState(isoToDatetimeLocal(pago.fecha))
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
    if (!confirm('¿Seguro que deseas editar este pago?')) return
    setGuardando(true); setError('')
    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    const nuevaFechaISO = esGerencia && fecha ? new Date(fecha).toISOString() : pago.fecha
    try {
      const updatePayload: Record<string, unknown> = { monto: montoNum, metodo_pago_id: metodoPagoId }
      if (esGerencia && fecha) updatePayload.fecha = nuevaFechaISO
      const { error: err } = await supabase.from('pagos_colaborador_caja').update(updatePayload).eq('id', pago.id)
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'pagos_colaborador_caja',
        registro_id: pago.id,
        tipo: 'edicion',
        valor_anterior: { monto: pago.monto, metodo_pago_id: pago.metodoPagoId, fecha: pago.fecha },
        valor_nuevo: { monto: montoNum, metodo_pago_id: metodoPagoId, fecha: nuevaFechaISO },
        descripcion: `Editó el pago a colaborador "${pago.descripcion}"`,
        usuario_id: usuarioId,
      })
      onEditado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al editar el pago')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Editar pago a colaborador</h2>
        <p className="text-xs text-gray-500 mb-4">{pago.descripcion}</p>
        <div className="space-y-2">
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Monto</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-fuchsia-400 bg-white mt-0.5">
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
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400 mt-0.5 bg-white">
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
            className="flex-1 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

const OPCION_CAJA_FUERTE = '__caja_fuerte__'

function AjusteModal({ tenantId, usuarioId, cuentaInicial = '', onClose, onCreado }: {
  tenantId: string; usuarioId: string; cuentaInicial?: string; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [descripcion, setDescripcion] = useState('')
  const [signo, setSigno] = useState<'+' | '-'>('+')
  const [monto, setMonto] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState(cuentaInicial)
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [fecha, setFecha] = useState(nowDatetimeLocal())
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
    const esCajaFuerte = metodoPagoId === OPCION_CAJA_FUERTE
    try {
      const { data, error: err } = await supabase.from('ajustes_caja').insert({
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: esCajaFuerte ? null : metodoPagoId,
        cuenta_especial: esCajaFuerte ? 'caja_fuerte' : null,
        registrado_por: usuarioId,
        ...(fecha ? { fecha: new Date(fecha).toISOString() } : {}),
      }).select('id').single()
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'ajustes_caja',
        registro_id: (data as { id: string }).id,
        tipo: 'movimiento',
        valor_nuevo: { descripcion: descripcion.trim(), monto: montoNum, fecha: fecha ? new Date(fecha).toISOString() : undefined },
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
        <h2 className="font-bold text-gray-900 mb-1">{cuentaInicial === OPCION_CAJA_FUERTE ? 'Ajuste caja fuerte' : 'Ajuste de caja'}</h2>
        <p className="text-xs text-gray-500 mb-4">Solo Gerencia puede registrar ajustes — queda guardado quién y cuándo lo hizo.</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
            <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Motivo del ajuste</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Corrección de saldo en efectivo..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Cuenta</label>
            <select value={metodoPagoId} onChange={e => setMetodoPagoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 mt-0.5 bg-white">
              <option value="">Selecciona...</option>
              {metodosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              <option value={OPCION_CAJA_FUERTE}>Caja fuerte</option>
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

function EditarAjusteModal({ tenantId, usuarioId, ajuste, onClose, onEditado }: {
  tenantId: string; usuarioId: string
  ajuste: { id: string; descripcion: string; fecha: string }
  onClose: () => void; onEditado: () => void
}) {
  const supabase = createClient()
  const [fecha, setFecha] = useState(isoToDatetimeLocal(ajuste.fecha))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!fecha) return
    if (!confirm('¿Seguro que deseas cambiar la fecha de este ajuste?')) return
    setGuardando(true); setError('')
    const nuevaFechaISO = new Date(fecha).toISOString()
    try {
      const { error: err } = await supabase.from('ajustes_caja').update({ fecha: nuevaFechaISO }).eq('id', ajuste.id)
      if (err) throw new Error(err.message)
      await registrarAuditoria(supabase, {
        tenant_id: tenantId,
        tabla: 'ajustes_caja',
        registro_id: ajuste.id,
        tipo: 'edicion',
        valor_anterior: { fecha: ajuste.fecha },
        valor_nuevo: { fecha: nuevaFechaISO },
        descripcion: `Gerencia editó la fecha del ajuste de caja "${ajuste.descripcion}"`,
        usuario_id: usuarioId,
      })
      onEditado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al editar la fecha')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Editar fecha del ajuste</h2>
        <p className="text-xs text-gray-500 mb-4">{ajuste.descripcion}</p>
        <div>
          <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
          <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!fecha || guardando}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar fecha'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferirModal({ tenantId, usuarioId, esGerencia = false, onClose, onCreado }: {
  tenantId: string; usuarioId: string; esGerencia?: boolean; onClose: () => void; onCreado: () => void
}) {
  const supabase = createClient()
  const [cuentaOrigen, setCuentaOrigen] = useState('')
  const [cuentaDestino, setCuentaDestino] = useState('')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [fecha, setFecha] = useState(nowDatetimeLocal())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
  }, [supabase, tenantId])

  const opcionesCuentas = [
    ...metodosPago.map(m => ({ value: m.id, label: m.nombre })),
    { value: OPCION_CAJA_FUERTE, label: 'Caja fuerte' },
  ]

  const montoNum = parseInt(monto.replace(/\D/g, ''), 10) || 0
  const valido = cuentaOrigen !== '' && cuentaDestino !== '' && cuentaOrigen !== cuentaDestino && montoNum > 0

  const nombreCuenta = (id: string) =>
    id === OPCION_CAJA_FUERTE ? 'Caja fuerte' : (metodosPago.find(m => m.id === id)?.nombre ?? id)

  async function guardar() {
    if (!valido) return
    if (!confirm('¿Confirmar la transferencia?')) return
    setGuardando(true); setError('')

    const esCFOrigen = cuentaOrigen === OPCION_CAJA_FUERTE
    const esCFDestino = cuentaDestino === OPCION_CAJA_FUERTE
    const fechaPayload = esGerencia && fecha ? { fecha: new Date(fecha).toISOString() } : {}
    const desc = descripcion.trim() || `Transferencia de ${nombreCuenta(cuentaOrigen)} a ${nombreCuenta(cuentaDestino)}`

    try {
      if (esCFDestino && !esCFOrigen) {
        // Regular → Caja fuerte: gasto en origen + ajuste positivo en CF (simétrico a CF→Regular)
        const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
          supabase.from('gastos_caja').insert({
            tenant_id: tenantId, descripcion: desc, monto: montoNum,
            metodo_pago_id: cuentaOrigen, registrado_por: usuarioId, ...fechaPayload,
          }).select('id').single(),
          supabase.from('ajustes_caja').insert({
            tenant_id: tenantId, descripcion: desc, monto: montoNum,
            metodo_pago_id: null, cuenta_especial: 'caja_fuerte',
            registrado_por: usuarioId, ...fechaPayload,
          }).select('id').single(),
        ])
        if (e1) throw new Error(e1.message)
        if (e2) throw new Error(e2.message)
        await Promise.all([
          registrarAuditoria(supabase, { tenant_id: tenantId, tabla: 'gastos_caja', registro_id: (d1 as { id: string }).id, tipo: 'movimiento', valor_nuevo: { descripcion: desc, monto: montoNum }, descripcion: `Salida de ${formatCOP(montoNum)} de ${nombreCuenta(cuentaOrigen)} hacia Caja fuerte`, usuario_id: usuarioId }),
          registrarAuditoria(supabase, { tenant_id: tenantId, tabla: 'ajustes_caja', registro_id: (d2 as { id: string }).id, tipo: 'movimiento', valor_nuevo: { descripcion: desc, monto: montoNum }, descripcion: `Ingreso de ${formatCOP(montoNum)} en Caja fuerte desde ${nombreCuenta(cuentaOrigen)}`, usuario_id: usuarioId }),
        ])
      } else if (esCFOrigen && !esCFDestino) {
        // Caja fuerte → Regular: ajuste negativo en CF + ingreso en destino
        const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
          supabase.from('ajustes_caja').insert({
            tenant_id: tenantId, descripcion: desc, monto: -montoNum,
            metodo_pago_id: null, cuenta_especial: 'caja_fuerte',
            registrado_por: usuarioId, ...fechaPayload,
          }).select('id').single(),
          supabase.from('ingresos_caja').insert({
            tenant_id: tenantId, descripcion: desc, monto: montoNum,
            metodo_pago_id: cuentaDestino, registrado_por: usuarioId, ...fechaPayload,
          }).select('id').single(),
        ])
        if (e1) throw new Error(e1.message)
        if (e2) throw new Error(e2.message)
        await Promise.all([
          registrarAuditoria(supabase, { tenant_id: tenantId, tabla: 'ajustes_caja', registro_id: (d1 as { id: string }).id, tipo: 'movimiento', valor_nuevo: { descripcion: desc, monto: -montoNum }, descripcion: `Salida de ${formatCOP(montoNum)} de Caja fuerte hacia ${nombreCuenta(cuentaDestino)}`, usuario_id: usuarioId }),
          registrarAuditoria(supabase, { tenant_id: tenantId, tabla: 'ingresos_caja', registro_id: (d2 as { id: string }).id, tipo: 'movimiento', valor_nuevo: { descripcion: desc, monto: montoNum }, descripcion: `Ingreso de ${formatCOP(montoNum)} desde Caja fuerte a ${nombreCuenta(cuentaDestino)}`, usuario_id: usuarioId }),
        ])
      } else {
        // Regular → Regular: gasto en origen + ingreso en destino
        const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
          supabase.from('gastos_caja').insert({
            tenant_id: tenantId, descripcion: desc, monto: montoNum,
            metodo_pago_id: cuentaOrigen, registrado_por: usuarioId, ...fechaPayload,
          }).select('id').single(),
          supabase.from('ingresos_caja').insert({
            tenant_id: tenantId, descripcion: desc, monto: montoNum,
            metodo_pago_id: cuentaDestino, registrado_por: usuarioId, ...fechaPayload,
          }).select('id').single(),
        ])
        if (e1) throw new Error(e1.message)
        if (e2) throw new Error(e2.message)
        await Promise.all([
          registrarAuditoria(supabase, { tenant_id: tenantId, tabla: 'gastos_caja', registro_id: (d1 as { id: string }).id, tipo: 'movimiento', valor_nuevo: { descripcion: desc, monto: montoNum }, descripcion: `Salida de ${formatCOP(montoNum)} de ${nombreCuenta(cuentaOrigen)} hacia ${nombreCuenta(cuentaDestino)}`, usuario_id: usuarioId }),
          registrarAuditoria(supabase, { tenant_id: tenantId, tabla: 'ingresos_caja', registro_id: (d2 as { id: string }).id, tipo: 'movimiento', valor_nuevo: { descripcion: desc, monto: montoNum }, descripcion: `Ingreso de ${formatCOP(montoNum)} desde ${nombreCuenta(cuentaOrigen)} a ${nombreCuenta(cuentaDestino)}`, usuario_id: usuarioId }),
        ])
      }
      onCreado()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al registrar la transferencia')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Transferir entre cuentas</h2>
        <p className="text-xs text-gray-500 mb-4">Mueve dinero de una cuenta a otra. Los saldos se actualizan automáticamente.</p>
        <div className="space-y-2">
          {esGerencia && (
            <div>
              <label className="text-xs text-purple-700 font-semibold">Fecha y hora</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 mt-0.5 bg-purple-50" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">De (cuenta origen)</label>
            <select value={cuentaOrigen} onChange={e => { setCuentaOrigen(e.target.value); if (e.target.value === cuentaDestino) setCuentaDestino('') }}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mt-0.5 bg-white">
              <option value="">Selecciona cuenta origen...</option>
              {opcionesCuentas.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">A (cuenta destino)</label>
            <select value={cuentaDestino} onChange={e => setCuentaDestino(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mt-0.5 bg-white">
              <option value="">Selecciona cuenta destino...</option>
              {opcionesCuentas.filter(o => o.value !== cuentaOrigen).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Descripción (opcional)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder={cuentaOrigen && cuentaDestino ? `Transferencia de ${nombreCuenta(cuentaOrigen)} a ${nombreCuenta(cuentaDestino)}` : 'Descripción...'}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Monto</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-400 bg-white mt-0.5">
              <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-1.5">$</span>
              <input type="text" inputMode="numeric"
                value={monto ? Number(monto.replace(/\D/g, '')).toLocaleString('es-CO') : ''}
                onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="flex-1 px-2 py-1.5 text-sm font-mono text-right focus:outline-none" />
            </div>
          </div>
          {cuentaOrigen && cuentaDestino && montoNum > 0 && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              Sale <strong>{formatCOP(montoNum)}</strong> de <strong>{nombreCuenta(cuentaOrigen)}</strong> →
              Entra <strong>{formatCOP(montoNum)}</strong> en <strong>{nombreCuenta(cuentaDestino)}</strong>
            </p>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!valido || guardando}
            className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Transfiriendo...' : 'Transferir'}
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
  const [movimientosTotales, setMovimientosTotales] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [catFiltro, setCatFiltro] = useState<FiltroGrupo>('todos')
  const [filtroMetodo, setFiltroMetodo] = useState<FiltroMetodo>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [gastoModal, setGastoModal] = useState<{ titulo: string; descripcionInicial: string } | null>(null)
  const [ajusteOpen, setAjusteOpen] = useState<{ cuentaInicial?: string } | null>(null)
  const [transferirOpen, setTransferirOpen] = useState(false)
  const [planillaOpen, setPlanillaOpen] = useState(false)
  const [editAjuste, setEditAjuste] = useState<{ id: string; descripcion: string; fecha: string } | null>(null)
  const [editGasto, setEditGasto] = useState<{ id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string } | null>(null)
  const [ingresoModalOpen, setIngresoModalOpen] = useState(false)
  const [editIngreso, setEditIngreso] = useState<{ id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string } | null>(null)
  const [pagoColabModalOpen, setPagoColabModalOpen] = useState(false)
  const [editPagoColab, setEditPagoColab] = useState<{ id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string } | null>(null)
  const [cierresModalOpen, setCierresModalOpen] = useState(false)
  const [vistaTabla, setVistaTabla] = useState<'item' | 'metodo'>('item')

  const esGerencia = profile?.rol === 'gerencia' || profile?.rol === 'dueno'
  // Ver saldo y transacciones de Caja fuerte: gerencia/dueño siempre, o
  // cualquier otro usuario al que se le haya dado acceso puntual desde
  // Mi equipo (usuarios.acceso_caja_fuerte) — Efectivo y Nequi ya son
  // visibles para todos los roles.
  const puedeVerCajaFuerte = esGerencia || profile?.acceso_caja_fuerte === true
  // Editar/eliminar gastos de caja (incluye transferencias) — Gerencia y Admin.
  // Los ajustes de caja siguen exclusivos de Gerencia (requisito explícito distinto).
  const puedeEditarGastos = esGerencia || profile?.rol === 'admin'
  // El monto de los ajustes de caja solo lo ve gerencia; admin ve la fila pero el monto oculto.
  const ocultarMontoAjuste = (categoria: Categoria) => categoria === 'ajuste' && profile?.rol === 'admin'
  const { desde, hasta } = calcularRango(periodo, desdeManual, hastaManual)
  const etiquetaIngresoGasto = etiquetaPeriodo(periodo, desde, hasta)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    // Colombia es UTC-5 todo el año (sin horario de verano). Sin el offset
    // explícito, Postgres interpretaba "hoy 00:00" como UTC, no como hora
    // local — el filtro de "Hoy" quedaba corrido ~5 horas (perdía pagos de la
    // noche de hoy y sumaba pagos de la noche de ayer).
    const desdeISO = `${desde}T00:00:00-05:00`
    const hastaISO = `${hasta}T23:59:59-05:00`

    const [lista, listaTotal] = await Promise.all([
      construirMovimientos(supabase, profile.tenant_id, desdeISO, hastaISO),
      construirMovimientos(supabase, profile.tenant_id, null, null),
    ])

    setMovimientos(lista)
    setMovimientosTotales(listaTotal)
    setLoading(false)
  }, [profile?.tenant_id, supabase, desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  // Ref que siempre apunta al cargar más reciente (con el período actual).
  // Así el canal realtime no se tiene que recrear cuando cambia el período.
  const cargarRef = useRef(cargar)
  useEffect(() => { cargarRef.current = cargar }, [cargar])

  // Realtime: recarga automática cuando cualquier tabla de caja cambia en la BD.
  // Debounce de 400 ms para agrupar rafagas de eventos (ej. bulk insert).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!profile?.tenant_id) return
    const tid = profile.tenant_id

    const trigger = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => cargarRef.current(), 400)
    }

    const ch = supabase
      .channel(`caja-rt-${tid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_orden',       filter: `tenant_id=eq.${tid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_proveedor',   filter: `tenant_id=eq.${tid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_caja',       filter: `tenant_id=eq.${tid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos_caja',     filter: `tenant_id=eq.${tid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ajustes_caja',      filter: `tenant_id=eq.${tid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_colaborador_caja', filter: `tenant_id=eq.${tid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lava_moto_ordenes', filter: `tenant_id=eq.${tid}` }, trigger)
      .subscribe()

    // Polling de seguridad cada 60 s por si algún evento realtime se pierde
    const pollId = setInterval(() => cargarRef.current(), 60_000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(ch)
      clearInterval(pollId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  const filtrados = useMemo(() => {
    let r = movimientos
    if (!puedeVerCajaFuerte) {
      r = r.filter(m => m.cuentaEspecial !== 'caja_fuerte' && m.metodoPago?.trim().toLowerCase() !== 'caja fuerte')
    }
    if (catFiltro !== 'todos') {
      r = r.filter(m => {
        const esTransfer = esTransferenciaConcepto(m.concepto)
        switch (catFiltro) {
          case 'servicios_tecnicos': return m.categoria === 'ingreso_st'
          case 'venta_repuestos':   return m.categoria === 'ingreso_venta' || m.categoria === 'ingreso_insumo' || m.categoria === 'ingreso_lavado' || m.categoria === 'ingreso_externo'
          case 'porta_placas':      return m.categoria === 'porta_placas'
          case 'ingreso_caja':      return m.categoria === 'ingreso_manual' && !esTransfer
          case 'gastos_caja':       return m.categoria === 'gasto' && !esTransfer
          case 'costos_externos':   return m.categoria === 'costo_externo' || m.categoria === 'pago_proveedor'
          case 'costos_lavado':     return m.categoria === 'costo_lavado'
          case 'transferencias':    return esTransfer
          case 'ajuste_caja':       return m.categoria === 'ajuste' && !esTransfer
          case 'pago_colaborador':  return m.categoria === 'pago_colaborador'
          default:                  return true
        }
      })
    }
    if (filtroMetodo !== 'todos') {
      r = r.filter(m => {
        const mp = m.metodoPago?.trim().toLowerCase() ?? ''
        switch (filtroMetodo) {
          case 'efectivo':    return mp === 'efectivo'
          case 'nequi':       return mp === 'nequi'
          case 'caja_fuerte': return m.cuentaEspecial === 'caja_fuerte' || mp === 'caja fuerte'
          default:            return true
        }
      })
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      r = r.filter(m =>
        m.concepto.toLowerCase().includes(q) ||
        (m.nombre ?? '').toLowerCase().includes(q) ||
        (m.codigo ?? '').toLowerCase().includes(q)
      )
    }
    return r
  }, [movimientos, catFiltro, filtroMetodo, busqueda, puedeVerCajaFuerte])

  const totalesFiltrados = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    for (const m of filtrados) {
      if (m.monto >= 0) ingresos += m.monto
      else egresos += m.monto
    }
    return { ingresos, egresos, neto: ingresos + egresos }
  }, [filtrados])

  // Saldo actual (histórico, no depende del período seleccionado) por cuenta y de
  // Caja fuerte — se calcula sobre movimientosTotales (todos los movimientos sin filtrar).
  const saldosCuentas = useMemo(() => {
    const mapa = new Map<string, { id: string; nombre: string; saldo: number }>()
    for (const m of movimientosTotales) {
      if (!CATEGORIAS_CON_CUENTA.includes(m.categoria)) continue
      if (m.cuentaEspecial === 'caja_fuerte') continue
      const key = m.metodoPagoId ?? 'sin_metodo'
      const nombre = m.metodoPago ?? 'Sin método especificado'
      if (!mapa.has(key)) mapa.set(key, { id: key, nombre, saldo: 0 })
      mapa.get(key)!.saldo += m.monto
    }
    return mapa
  }, [movimientosTotales])

  const saldoCajaFuerte = useMemo(() => {
    let saldo = 0
    for (const m of movimientosTotales) {
      if (m.categoria === 'gasto' && m.concepto.trim().toLowerCase().startsWith(TRANSFERENCIA_CAJA_FUERTE)) {
        saldo += Math.abs(m.monto)
      } else if (m.cuentaEspecial === 'caja_fuerte') {
        saldo += m.monto
      }
    }
    return saldo
  }, [movimientosTotales])

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

  // Ingreso y gasto del período seleccionado, por cuenta — para emparejar cada cuenta
  // con su propia tarjeta de movimiento del período, justo debajo de su saldo.
  const movimientosPorCuenta = useMemo(() => {
    const mapa = new Map<string, { ingreso: number; egreso: number }>()
    for (const m of movimientos) {
      if (!CATEGORIAS_CON_CUENTA.includes(m.categoria)) continue
      if (m.cuentaEspecial === 'caja_fuerte') continue
      const key = m.metodoPagoId ?? 'sin_metodo'
      if (!mapa.has(key)) mapa.set(key, { ingreso: 0, egreso: 0 })
      const c = mapa.get(key)!
      if (m.monto >= 0) c.ingreso += m.monto
      else c.egreso += Math.abs(m.monto)
    }
    return mapa
  }, [movimientos])

  // "Caja fuerte" no es un método de pago del catálogo, es una cuenta independiente
  // donde Gerencia guarda parte del dinero. Se alimenta de las transferencias hechas
  // con el botón "Transferir a caja fuerte" (un gasto en la cuenta de origen) y de los
  // ajustes de caja registrados directamente contra "Caja fuerte".
  const cajaFuertePeriodo = useMemo(() => {
    let ingreso = 0, egreso = 0
    for (const m of movimientos) {
      if (m.categoria === 'gasto' && m.concepto.trim().toLowerCase().startsWith(TRANSFERENCIA_CAJA_FUERTE)) {
        ingreso += Math.abs(m.monto)
      } else if (m.cuentaEspecial === 'caja_fuerte') {
        if (m.monto >= 0) ingreso += m.monto
        else egreso += Math.abs(m.monto)
      }
    }
    return { ingreso, egreso }
  }, [movimientos])

  const saldosCuentasOrdenados = useMemo(() => [...saldosCuentas.values()].sort((a, b) => b.saldo - a.saldo), [saldosCuentas])

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

  async function eliminarIngreso(m: { rawId: string; concepto: string; monto: number }) {
    if (!confirm(`¿Eliminar el ingreso "${m.concepto}" por ${formatCOP(Math.abs(m.monto))}?`)) return
    const { error } = await supabase.from('ingresos_caja').delete().eq('id', m.rawId)
    if (error) { alert(`No se pudo eliminar: ${error.message}`); return }
    await registrarAuditoria(supabase, {
      tenant_id: profile!.tenant_id,
      tabla: 'ingresos_caja',
      registro_id: m.rawId,
      tipo: 'eliminacion',
      valor_anterior: { descripcion: m.concepto, monto: Math.abs(m.monto) },
      descripcion: `Eliminó el ingreso de caja "${m.concepto}"`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  async function eliminarPagoColaborador(m: { rawId: string; concepto: string; monto: number }) {
    if (!confirm(`¿Eliminar "${m.concepto}" por ${formatCOP(Math.abs(m.monto))}?`)) return
    const { error } = await supabase.from('pagos_colaborador_caja').delete().eq('id', m.rawId)
    if (error) { alert(`No se pudo eliminar: ${error.message}`); return }
    await registrarAuditoria(supabase, {
      tenant_id: profile!.tenant_id,
      tabla: 'pagos_colaborador_caja',
      registro_id: m.rawId,
      tipo: 'eliminacion',
      valor_anterior: { descripcion: m.concepto, monto: Math.abs(m.monto) },
      descripcion: `Eliminó el pago a colaborador "${m.concepto}"`,
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
          esGerencia={esGerencia}
          onClose={() => setGastoModal(null)}
          onCreado={cargar}
        />
      )}

      {ajusteOpen && profile?.tenant_id && profile?.id && (
        <AjusteModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          cuentaInicial={ajusteOpen.cuentaInicial}
          onClose={() => setAjusteOpen(null)}
          onCreado={cargar}
        />
      )}

      {transferirOpen && profile?.tenant_id && profile?.id && (
        <TransferirModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          esGerencia={esGerencia}
          onClose={() => setTransferirOpen(false)}
          onCreado={cargar}
        />
      )}

      {planillaOpen && profile?.tenant_id && (
        <PlanillaWorldOfficeModal
          tenantId={profile.tenant_id}
          onClose={() => setPlanillaOpen(false)}
        />
      )}

      {cierresModalOpen && profile?.tenant_id && (
        <RegistroCierresModal
          tenantId={profile.tenant_id}
          onClose={() => setCierresModalOpen(false)}
        />
      )}

      {editAjuste && profile?.tenant_id && profile?.id && (
        <EditarAjusteModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          ajuste={editAjuste}
          onClose={() => setEditAjuste(null)}
          onEditado={cargar}
        />
      )}

      {editGasto && profile?.tenant_id && profile?.id && (
        <EditarGastoModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          gasto={editGasto}
          esGerencia={esGerencia}
          onClose={() => setEditGasto(null)}
          onEditado={cargar}
        />
      )}

      {ingresoModalOpen && profile?.tenant_id && profile?.id && (
        <NuevoIngresoModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          esGerencia={esGerencia}
          onClose={() => setIngresoModalOpen(false)}
          onCreado={cargar}
        />
      )}

      {editIngreso && profile?.tenant_id && profile?.id && (
        <EditarIngresoModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          ingreso={editIngreso}
          esGerencia={esGerencia}
          onClose={() => setEditIngreso(null)}
          onEditado={cargar}
        />
      )}

      {pagoColabModalOpen && profile?.tenant_id && profile?.id && (
        <NuevoPagoColaboradorModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          esGerencia={esGerencia}
          onClose={() => setPagoColabModalOpen(false)}
          onCreado={cargar}
        />
      )}

      {editPagoColab && profile?.tenant_id && profile?.id && (
        <EditarPagoColaboradorModal
          tenantId={profile.tenant_id}
          usuarioId={profile.id}
          pago={editPagoColab}
          esGerencia={esGerencia}
          onClose={() => setEditPagoColab(null)}
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
          <button onClick={() => setIngresoModalOpen(true)}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
            + Ingreso a caja
          </button>
          <button onClick={() => setPagoColabModalOpen(true)}
            className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg text-sm font-semibold transition-colors">
            + Pago Colaborador
          </button>
          <button onClick={() => setTransferirOpen(true)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors">
            Transferir
          </button>
          {esGerencia && (
            <button onClick={() => setAjusteOpen({})}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-semibold transition-colors">
              + Ajuste
            </button>
          )}
        </div>
        <div className="mt-3 w-full flex items-center justify-between">
          <button
            onClick={() => setPlanillaOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generar Planilla WorldOffice
          </button>
          <button
            onClick={() => setCierresModalOpen(true)}
            className="group flex flex-col items-center justify-center gap-0.5 w-16 h-16 bg-white hover:bg-gray-50 text-gray-700 rounded-2xl text-[10px] font-semibold leading-tight text-center border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 transition-all"
          >
            <svg className="w-5 h-5 flex-shrink-0 text-gray-600 group-hover:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Cierres<br />Diario
          </button>
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

      {/* Por cuenta: saldo actual (histórico) + ingreso/gasto del período seleccionado */}
      <div>
        <p className="text-xs text-gray-400 mb-2">
          El saldo actual es el total acumulado y no cambia según el período; el ingreso y el gasto sí son del período seleccionado.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {saldosCuentasOrdenados.length === 0 && !puedeVerCajaFuerte && (
            <p className="text-sm text-gray-400 col-span-full text-center py-6">Sin movimientos registrados</p>
          )}
          {saldosCuentasOrdenados.map(s => {
            const color = colorCuenta(s.nombre)
            const mov = movimientosPorCuenta.get(s.id) ?? { ingreso: 0, egreso: 0 }
            return (
              <div key={s.id} className="flex flex-col gap-3">
                <div className={`${color.bg} rounded-xl border ${color.border} p-5`}>
                  <p className="text-xs font-medium text-gray-500 mb-2">{s.nombre}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Saldo actual</p>
                  <p className={`text-3xl font-bold font-mono leading-tight ${s.saldo >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCOP(s.saldo)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Saldo {etiquetaIngresoGasto}</p>
                    <p className={`text-sm font-bold font-mono ${(mov.ingreso - mov.egreso) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {formatCOP(mov.ingreso - mov.egreso)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Ingreso {etiquetaIngresoGasto}</p>
                    <p className="text-sm font-semibold font-mono text-emerald-700">{formatCOP(mov.ingreso)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-red-500 uppercase tracking-wide">Gasto {etiquetaIngresoGasto}</p>
                    <p className="text-sm font-semibold font-mono text-red-600">{formatCOP(mov.egreso)}</p>
                  </div>
                </div>
              </div>
            )
          })}
          {puedeVerCajaFuerte && (() => {
            const color = colorCuenta('caja fuerte')
            return (
              <div className="flex flex-col gap-3">
                <div className={`${color.bg} rounded-xl border ${color.border} p-5`}>
                  <p className="text-xs font-medium text-gray-500 mb-2">Caja fuerte</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Saldo actual</p>
                  <p className={`text-3xl font-bold font-mono leading-tight ${saldoCajaFuerte >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCOP(saldoCajaFuerte)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Saldo {etiquetaIngresoGasto}</p>
                    <p className={`text-sm font-bold font-mono ${(cajaFuertePeriodo.ingreso - cajaFuertePeriodo.egreso) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {formatCOP(cajaFuertePeriodo.ingreso - cajaFuertePeriodo.egreso)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Ingreso {etiquetaIngresoGasto}</p>
                    <p className="text-sm font-semibold font-mono text-emerald-700">{formatCOP(cajaFuertePeriodo.ingreso)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-red-500 uppercase tracking-wide">Gasto {etiquetaIngresoGasto}</p>
                    <p className="text-sm font-semibold font-mono text-red-600">{formatCOP(cajaFuertePeriodo.egreso)}</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Filtros de lista */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, descripción o código..."
            className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
        <div className="flex flex-wrap gap-1.5">
          {FILTROS_GRUPO.map(f => (
            <button
              key={f.id}
              onClick={() => setCatFiltro(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                catFiltro === f.id
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
          {FILTROS_METODO.filter(f => f.id !== 'caja_fuerte' || puedeVerCajaFuerte).map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroMetodo(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filtroMetodo === f.id ? f.activeColor : f.color
              }`}>
              {f.label}
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
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      esTransferenciaConcepto(m.concepto) ? 'bg-indigo-100 text-indigo-700' : CATEGORIA_BADGE[m.categoria]
                    }`}>
                      {esTransferenciaConcepto(m.concepto) ? 'Transferencia' : CATEGORIA_LABEL[m.categoria]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 truncate max-w-[280px]">{m.concepto}</td>
                  <td className={`px-4 py-3 text-right font-semibold font-mono whitespace-nowrap ${
                    m.categoria === 'ajuste' ? 'text-gray-700' : m.monto >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {ocultarMontoAjuste(m.categoria) ? '•••••••' : `${m.monto >= 0 ? '+' : ''}${formatCOP(m.monto)}`}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    {m.categoria === 'gasto' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditGasto({ id: m.rawId, descripcion: m.concepto, monto: Math.abs(m.monto), metodoPagoId: m.metodoPagoId, fecha: m.fecha })}
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
                      <>
                        <button
                          onClick={() => setEditAjuste({ id: m.rawId, descripcion: m.concepto, fecha: m.fecha })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar fecha
                        </button>
                        <button onClick={() => eliminarAjuste(m)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                    {m.categoria === 'ingreso_manual' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditIngreso({ id: m.rawId, descripcion: m.concepto, monto: Math.abs(m.monto), metodoPagoId: m.metodoPagoId, fecha: m.fecha })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminarIngreso(m)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                    {m.categoria === 'pago_colaborador' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditPagoColab({ id: m.rawId, descripcion: m.concepto, monto: Math.abs(m.monto), metodoPagoId: m.metodoPagoId, fecha: m.fecha })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminarPagoColaborador(m)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
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
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      esTransferenciaConcepto(f.concepto) ? 'bg-indigo-100 text-indigo-700' : CATEGORIA_BADGE[f.categoria]
                    }`}>
                      {esTransferenciaConcepto(f.concepto) ? 'Transferencia' : CATEGORIA_LABEL[f.categoria]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 truncate max-w-[280px]">{f.concepto}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{f.metodoPago ?? 'Sin método especificado'}</td>
                  <td className={`px-4 py-3 text-right font-semibold font-mono whitespace-nowrap ${
                    f.categoria === 'ajuste' ? 'text-gray-700' : f.monto >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {ocultarMontoAjuste(f.categoria) ? '•••••••' : `${f.monto >= 0 ? '+' : ''}${formatCOP(f.monto)}`}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    {f.categoria === 'gasto' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditGasto({ id: f.rawId, descripcion: f.concepto, monto: Math.abs(f.monto), metodoPagoId: f.metodoPagoId, fecha: f.fecha })}
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
                      <>
                        <button
                          onClick={() => setEditAjuste({ id: f.rawId, descripcion: f.concepto, fecha: f.fecha })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar fecha
                        </button>
                        <button onClick={() => eliminarAjuste(f)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                    {f.categoria === 'ingreso_manual' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditIngreso({ id: f.rawId, descripcion: f.concepto, monto: Math.abs(f.monto), metodoPagoId: f.metodoPagoId, fecha: f.fecha })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminarIngreso(f)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                    {f.categoria === 'pago_colaborador' && puedeEditarGastos && (
                      <>
                        <button
                          onClick={() => setEditPagoColab({ id: f.rawId, descripcion: f.concepto, monto: Math.abs(f.monto), metodoPagoId: f.metodoPagoId, fecha: f.fecha })}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => eliminarPagoColaborador(f)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                          Eliminar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de totales de la tabla filtrada */}
      {!loading && filtrados.length > 0 && (
        <div className="flex flex-wrap gap-4 items-center justify-end px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm">
          <span className="text-gray-500 font-medium text-xs mr-auto">
            {filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}{catFiltro !== 'todos' ? ` · ${FILTROS_GRUPO.find(f => f.id === catFiltro)?.label}` : ''}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Ingresos</span>
            <span className="font-semibold font-mono text-emerald-700">+{formatCOP(totalesFiltrados.ingresos)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Egresos</span>
            <span className="font-semibold font-mono text-red-600">{formatCOP(totalesFiltrados.egresos)}</span>
          </div>
          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="text-xs text-gray-500 font-medium">Neto</span>
            <span className={`font-bold font-mono ${totalesFiltrados.neto >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              {totalesFiltrados.neto >= 0 ? '+' : ''}{formatCOP(totalesFiltrados.neto)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
