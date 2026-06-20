'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type MetodoPago = { id: string; nombre: string; recargo_porcentaje: number }
type Entidad = { id: string; nombre: string }
type Estudio = { id: string; entidad_id: string; estado: 'sin_iniciar' | 'en_estudio' | 'aprobado' | 'rechazado'; monto_aprobado: number | null }

const ESTADO_LABEL: Record<Estudio['estado'], string> = {
  sin_iniciar: 'Sin iniciar', en_estudio: 'En estudio', aprobado: 'Aprobado', rechazado: 'Rechazado',
}
const ESTADO_COLOR: Record<Estudio['estado'], string> = {
  sin_iniciar: 'bg-gray-100 text-gray-600', en_estudio: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700', rechazado: 'bg-red-100 text-red-700',
}

export default function PagoTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [formaPago, setFormaPago]       = useState<'contado' | 'credito' | ''>('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [cuotaInicialSi, setCuotaInicialSi] = useState(false)
  const [cuotaInicial, setCuotaInicial] = useState('')
  const [cuotaDeseada, setCuotaDeseada] = useState('')
  const [metodos, setMetodos]   = useState<MetodoPago[]>([])
  const [entidades, setEntidades] = useState<Entidad[]>([])
  const [estudios, setEstudios]   = useState<Estudio[]>([])
  const [totalMotos, setTotalMotos] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  const cargar = useCallback(async () => {
    const [{ data: cliente }, { data: met }, { data: ent }, { data: est }, { data: motos }] = await Promise.all([
      supabase.from('clientes')
        .select('forma_pago, metodo_pago_id, credito_tiene_cuota_inicial, cuota_inicial, cuota_deseada')
        .eq('id', clienteId).single(),
      supabase.from('metodos_pago').select('id, nombre, recargo_porcentaje').eq('tenant_id', tenantId).eq('activo', true),
      supabase.from('entidades_financieras').select('id, nombre').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
      supabase.from('clientes_credito_estudio').select('id, entidad_id, estado, monto_aprobado').eq('cliente_id', clienteId),
      supabase.from('clientes_motos_interes').select('disponibilidad, motos_catalogo(precio, costo_documentos, costo_prenda)').eq('cliente_id', clienteId),
    ])

    if (cliente) {
      setFormaPago((cliente.forma_pago ?? '') as 'contado' | 'credito' | '')
      setMetodoPagoId(cliente.metodo_pago_id ?? '')
      setCuotaInicialSi(!!cliente.credito_tiene_cuota_inicial)
      setCuotaInicial(cliente.cuota_inicial?.toString() ?? '')
      setCuotaDeseada(cliente.cuota_deseada?.toString() ?? '')
    }
    setMetodos((met ?? []) as MetodoPago[])
    setEntidades((ent ?? []) as Entidad[])
    setEstudios((est ?? []) as Estudio[])

    const conCredito = (cliente?.forma_pago ?? '') === 'credito'
    const total = (motos ?? []).reduce((s, m) => {
      const mc = Array.isArray(m.motos_catalogo) ? m.motos_catalogo[0] : m.motos_catalogo
      if (!mc) return s
      return s + mc.precio + mc.costo_documentos + (conCredito ? mc.costo_prenda : 0)
    }, 0)
    setTotalMotos(total)
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  const recargo = useMemo(() => metodos.find(m => m.id === metodoPagoId)?.recargo_porcentaje ?? 0, [metodos, metodoPagoId])
  const totalFinal = useMemo(() => totalMotos * (1 + recargo / 100), [totalMotos, recargo])

  async function guardar() {
    setSaving(true)
    try {
      const { error } = await supabase.from('clientes').update({
        forma_pago: formaPago || null,
        metodo_pago_id: metodoPagoId || null,
        credito_tiene_cuota_inicial: formaPago === 'credito' ? cuotaInicialSi : null,
        cuota_inicial: formaPago === 'credito' && cuotaInicialSi && cuotaInicial ? parseFloat(cuotaInicial) : null,
        cuota_deseada: formaPago === 'credito' && cuotaDeseada ? parseFloat(cuotaDeseada) : null,
      }).eq('id', clienteId)
      if (error) throw new Error(error.message)
      await cargar()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function cambiarEstado(entidadId: string, estado: Estudio['estado']) {
    const existente = estudios.find(e => e.entidad_id === entidadId)
    if (existente) {
      await supabase.from('clientes_credito_estudio').update({ estado, actualizado_por: usuarioId, updated_at: new Date().toISOString() }).eq('id', existente.id)
    } else {
      await supabase.from('clientes_credito_estudio').insert({ cliente_id: clienteId, tenant_id: tenantId, entidad_id: entidadId, estado, actualizado_por: usuarioId })
    }
    cargar()
  }

  async function setMonto(entidadId: string, monto: string) {
    const existente = estudios.find(e => e.entidad_id === entidadId)
    if (!existente) return
    await supabase.from('clientes_credito_estudio').update({ monto_aprobado: monto ? parseFloat(monto) : null }).eq('id', existente.id)
    setEstudios(p => p.map(e => e.id === existente.id ? { ...e, monto_aprobado: monto ? parseFloat(monto) : null } : e))
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Forma de pago</p>
        <div className="flex gap-2">
          {(['contado', 'credito'] as const).map(opt => (
            <button key={opt} onClick={() => setFormaPago(opt)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                formaPago === opt ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {opt === 'contado' ? 'Contado' : 'Crédito'}
            </button>
          ))}
        </div>
      </div>

      {formaPago === 'credito' && (
        <div className="space-y-2 border border-gray-200 rounded-xl p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cuotaInicialSi} onChange={e => setCuotaInicialSi(e.target.checked)} />
            Tiene cuota inicial
          </label>
          {cuotaInicialSi && (
            <div>
              <label className="text-xs text-gray-500">Monto cuota inicial (COP)</label>
              <input type="number" value={cuotaInicial} onChange={e => setCuotaInicial(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Cuota mensual deseada (COP)</label>
            <input type="number" value={cuotaDeseada} onChange={e => setCuotaDeseada(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Estudio de crédito por entidad</p>
          {entidades.length === 0 && <p className="text-xs text-gray-400">No hay entidades configuradas (Gerencia las administra en Config Ventas).</p>}
          {entidades.map(ent => {
            const est = estudios.find(e => e.entidad_id === ent.id)
            const estado = est?.estado ?? 'sin_iniciar'
            return (
              <div key={ent.id} className="bg-gray-50 rounded-lg p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{ent.nombre}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[estado]}`}>{ESTADO_LABEL[estado]}</span>
                </div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {(['sin_iniciar', 'en_estudio', 'aprobado', 'rechazado'] as const).map(opt => (
                    <button key={opt} onClick={() => cambiarEstado(ent.id, opt)}
                      className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                        estado === opt ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {ESTADO_LABEL[opt]}
                    </button>
                  ))}
                </div>
                {estado === 'aprobado' && (
                  <input type="number" placeholder="Monto aprobado" defaultValue={est?.monto_aprobado ?? ''}
                    onBlur={e => setMonto(ent.id, e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs mt-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500">Método de pago recibido</label>
        <select value={metodoPagoId} onChange={e => setMetodoPagoId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
          <option value="">Selecciona...</option>
          {metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.recargo_porcentaje > 0 ? ` (+${m.recargo_porcentaje}%)` : ''}</option>)}
        </select>
      </div>

      {totalMotos > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-xs text-emerald-700">Total motos seleccionadas: {formatCOP(totalMotos)}</p>
          {recargo > 0 && <p className="text-xs text-emerald-700">Recargo por método de pago (+{recargo}%): {formatCOP(totalMotos * recargo / 100)}</p>}
          <p className="text-sm font-bold text-emerald-800 mt-1">Total a cobrar: {formatCOP(totalFinal)}</p>
        </div>
      )}

      <button onClick={guardar} disabled={saving}
        className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
        {saving ? 'Guardando...' : 'Guardar forma de pago'}
      </button>
    </div>
  )
}
