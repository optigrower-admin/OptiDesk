'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

type Periodo = 'hoy' | 'semana' | 'mes' | 'rango'
type Categoria = 'ingreso_st' | 'ingreso_venta' | 'ingreso_insumo' | 'ingreso_lavado' | 'ingreso_externo' | 'ingreso_manual' | 'costo_externo' | 'costo_lavado' | 'gasto' | 'ajuste'

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
  cuentaEspecial: 'caja_fuerte' | null
  grupo: string
}

const CATEGORIA_LABEL: Record<Categoria, string> = {
  ingreso_st:      'Ingresos Servicio Técnico',
  ingreso_venta:   'Ingresos Venta repuesto directa',
  ingreso_insumo:  'Ingresos Insumos',
  ingreso_lavado:  'Ingresos Servicio de Lavado',
  ingreso_externo: 'Ingresos repuestos Externos/Terceros',
  ingreso_manual:  'Ingreso a Caja',
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
  ingreso_manual:  'bg-lime-100 text-lime-700',
  costo_externo:   'bg-amber-100 text-amber-700',
  costo_lavado:    'bg-teal-200 text-teal-800',
  gasto:           'bg-red-100 text-red-700',
  ajuste:          'bg-gray-700 text-white',
}

function grupoOrden(ord: { numero: number; placa: string; cliente: string } | null): string {
  return ord ? `Orden #${ord.numero} (${ord.placa ?? '—'}) · ${ord.cliente ?? 'Cliente'}` : 'Sin orden asociada'
}

const TRANSFERENCIA_CAJA_FUERTE = 'transferencia a caja fuerte'

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

const OPCION_CAJA_FUERTE = '__caja_fuerte__'

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
    const esCajaFuerte = metodoPagoId === OPCION_CAJA_FUERTE
    try {
      const { data, error: err } = await supabase.from('ajustes_caja').insert({
        tenant_id: tenantId,
        descripcion: descripcion.trim(),
        monto: montoNum,
        metodo_pago_id: esCajaFuerte ? null : metodoPagoId,
        cuenta_especial: esCajaFuerte ? 'caja_fuerte' : null,
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

const CATEGORIAS_CON_CUENTA: Categoria[] = ['ingreso_st', 'ingreso_venta', 'ingreso_manual', 'gasto', 'costo_lavado', 'costo_externo', 'ajuste']

// Construye la lista de movimientos para un tenant. Si desdeISO/hastaISO son null no se
// filtra por fecha (uso para el saldo histórico, que no depende del período seleccionado).
async function construirMovimientos(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  desdeISO: string | null,
  hastaISO: string | null
): Promise<Movimiento[]> {
  let qPagos = supabase.from('pagos_orden')
    .select('id, orden_id, monto, fecha, metodo_pago_id, metodos_pago(nombre), ordenes(numero, placa, cliente, tipo_orden)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qPagos = qPagos.gte('fecha', desdeISO)
  if (hastaISO) qPagos = qPagos.lte('fecha', hastaISO)

  let qCostosExt = supabase.from('items_orden')
    .select('id, descripcion, costo, precio_venta, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
    .eq('origen', 'externo')
    .eq('ordenes.tenant_id', tenantId)
    .or('costo.gt.0,precio_venta.gt.0')
  if (desdeISO) qCostosExt = qCostosExt.gte('created_at', desdeISO)
  if (hastaISO) qCostosExt = qCostosExt.lte('created_at', hastaISO)

  let qGastos = supabase.from('gastos_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qGastos = qGastos.gte('fecha', desdeISO)
  if (hastaISO) qGastos = qGastos.lte('fecha', hastaISO)

  let qInsumos = supabase.from('items_orden')
    .select('id, descripcion, precio_venta, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
    .eq('origen', 'insumo')
    .eq('ordenes.tenant_id', tenantId)
  if (desdeISO) qInsumos = qInsumos.gte('created_at', desdeISO)
  if (hastaISO) qInsumos = qInsumos.lte('created_at', hastaISO)

  let qLavados = supabase.from('lava_moto_ordenes')
    .select('id, costo_unitario, precio_venta_unitario, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
    .eq('ordenes.tenant_id', tenantId)
    .or('costo_unitario.gt.0,precio_venta_unitario.gt.0')
  if (desdeISO) qLavados = qLavados.gte('created_at', desdeISO)
  if (hastaISO) qLavados = qLavados.lte('created_at', hastaISO)

  let qVentaDirecta = supabase.from('ordenes')
    .select('id, numero, placa, cliente, valor_abono, metodo_pago_id, metodos_pago(nombre), created_at')
    .eq('tenant_id', tenantId)
    .eq('tipo_orden', 'venta_repuestos')
    .gt('valor_abono', 0)
  if (desdeISO) qVentaDirecta = qVentaDirecta.gte('created_at', desdeISO)
  if (hastaISO) qVentaDirecta = qVentaDirecta.lte('created_at', hastaISO)

  let qAjustes = supabase.from('ajustes_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre), cuenta_especial')
    .eq('tenant_id', tenantId)
  if (desdeISO) qAjustes = qAjustes.gte('fecha', desdeISO)
  if (hastaISO) qAjustes = qAjustes.lte('fecha', hastaISO)

  let qIngresos = supabase.from('ingresos_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qIngresos = qIngresos.gte('fecha', desdeISO)
  if (hastaISO) qIngresos = qIngresos.lte('fecha', hastaISO)

  const [{ data: pagos }, { data: costosExt }, { data: gastos }, { data: insumos }, { data: lavados }, { data: ventaDirecta }, { data: ajustes }, { data: ingresos }] =
    await Promise.all([qPagos, qCostosExt, qGastos, qInsumos, qLavados, qVentaDirecta, qAjustes, qIngresos])

  const lista: Movimiento[] = []

  // Una venta directa de repuestos puede recibir su pago desde la pantalla
  // general de la orden (que registra en pagos_orden) en vez de la pantalla
  // de Repuestos (que solo actualiza ordenes.valor_abono). Si ya tiene algún
  // pago en pagos_orden, esa es la fuente de verdad — no se vuelve a contar
  // el mismo ingreso por el lado de ordenes.valor_abono.
  const ordenesConPagoRegistrado = new Set<string>()

  for (const p of (pagos ?? []) as unknown as { id: string; orden_id: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = p.ordenes
    const esVenta = ord?.tipo_orden === 'venta_repuestos'
    if (esVenta) ordenesConPagoRegistrado.add(p.orden_id)
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
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  for (const v of (ventaDirecta ?? []) as unknown as { id: string; numero: number; placa: string; cliente: string; valor_abono: number; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; created_at: string }[]) {
    if (ordenesConPagoRegistrado.has(v.id)) continue
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
      cuentaEspecial: null,
      grupo: grupoOrden({ numero: v.numero, placa: v.placa, cliente: v.cliente }),
    })
  }

  for (const it of (costosExt ?? []) as unknown as { id: string; descripcion: string; costo: number; precio_venta: number; cantidad: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
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
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
    // El ingreso por venta del repuesto externo solo se cuenta aparte cuando es una
    // Venta de repuestos directa. En Servicio Técnico ese valor ya está incluido en el
    // pago total de la orden (Ingresos Servicio Técnico), así que contarlo aquí también
    // duplicaría el ingreso.
    if (it.precio_venta > 0 && ord?.tipo_orden !== 'servicio') {
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
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
  }

  for (const lm of (lavados ?? []) as unknown as { id: string; costo_unitario: number; precio_venta_unitario: number; cantidad: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
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
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
    // Igual que con repuestos externos: si la orden es Servicio Técnico, este ingreso
    // ya está incluido en el pago total de la orden — no se cuenta aparte.
    if (lm.precio_venta_unitario > 0 && ord?.tipo_orden !== 'servicio') {
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
        cuentaEspecial: null,
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
      cuentaEspecial: null,
      grupo: CATEGORIA_LABEL.gasto,
    })
  }

  for (const it of (insumos ?? []) as unknown as { id: string; descripcion: string; precio_venta: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = it.ordenes
    const concepto = `${it.descripcion} · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`
    // Igual que con repuestos externos: si la orden es Servicio Técnico, este ingreso
    // ya está incluido en el pago total de la orden — no se cuenta aparte.
    if (ord?.tipo_orden === 'servicio') continue
    lista.push({
      id: `insumo_${it.id}`,
      rawId: it.id,
      fecha: it.created_at,
      categoria: 'ingreso_insumo',
      concepto,
      nombre: ord?.cliente ?? null,
      codigo: ord?.placa ?? null,
      monto: it.precio_venta,
      metodoPagoId: it.metodo_pago_id,
      metodoPago: it.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  for (const a of (ajustes ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; cuenta_especial: 'caja_fuerte' | null }[]) {
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
      metodoPago: a.cuenta_especial === 'caja_fuerte' ? 'Caja fuerte' : a.metodos_pago?.nombre ?? null,
      cuentaEspecial: a.cuenta_especial ?? null,
      grupo: CATEGORIA_LABEL.ajuste,
    })
  }

  for (const ig of (ingresos ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null }[]) {
    lista.push({
      id: `ingreso_${ig.id}`,
      rawId: ig.id,
      fecha: ig.fecha,
      categoria: 'ingreso_manual',
      concepto: ig.descripcion,
      nombre: ig.descripcion,
      codigo: null,
      monto: ig.monto,
      metodoPagoId: ig.metodo_pago_id,
      metodoPago: ig.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: CATEGORIA_LABEL.ingreso_manual,
    })
  }

  lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return lista
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
  const [catFiltro, setCatFiltro] = useState<Categoria | 'todos'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [gastoModal, setGastoModal] = useState<{ titulo: string; descripcionInicial: string } | null>(null)
  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [editGasto, setEditGasto] = useState<{ id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string } | null>(null)
  const [ingresoModalOpen, setIngresoModalOpen] = useState(false)
  const [editIngreso, setEditIngreso] = useState<{ id: string; descripcion: string; monto: number; metodoPagoId: string | null; fecha: string } | null>(null)
  const [vistaTabla, setVistaTabla] = useState<'item' | 'metodo'>('item')

  const esGerencia = profile?.rol === 'gerencia'
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
          onClose={() => setAjusteOpen(false)}
          onCreado={cargar}
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

      {/* Por cuenta: saldo actual (histórico) + ingreso/gasto del período seleccionado */}
      <div>
        <p className="text-xs text-gray-400 mb-2">
          El saldo actual es el total acumulado y no cambia según el período; el ingreso y el gasto sí son del período seleccionado.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {saldosCuentasOrdenados.length === 0 && !esGerencia && (
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
          {esGerencia && (() => {
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
                      <button onClick={() => eliminarAjuste(m)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                        Eliminar
                      </button>
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
                      <button onClick={() => eliminarAjuste(f)} className="text-xs text-red-600 hover:text-red-800 font-medium underline">
                        Eliminar
                      </button>
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
