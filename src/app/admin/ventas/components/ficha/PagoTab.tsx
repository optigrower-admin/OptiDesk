'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, calcularPrecioMoto } from '@/lib/ventas/pipeline'
import MoneyInput from '@/components/ui/MoneyInput'

const METODOS_PAGO_FIJOS = ['Transferencia', 'Efectivo', 'Financiera']

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onCreditoChange?: (aprobada: string | null, rechazadas: string[]) => void
}

type Entidad       = { id: string; nombre: string }
type Estudio       = { id: string; entidad_id: string; estado: 'sin_iniciar' | 'en_estudio' | 'aprobado' | 'rechazado'; monto_aprobado: number | null; bono: boolean }
type Bono          = { id: string; nombre: string }
type BonoAplicado  = { id: string; bono_id: string; monto: number }
type PagoRegistrado = {
  id: string
  codigo_factura: string | null
  monto: number
  metodo_pago: string | null
  created_at: string
}

type FormaPago = 'contado' | 'credito' | 'credito_ci' | ''

const ESTADO_LABEL: Record<Estudio['estado'], string> = {
  sin_iniciar: 'Sin iniciar', en_estudio: 'En estudio', aprobado: 'Aprobado', rechazado: 'Rechazado',
}
const ESTADO_COLOR: Record<Estudio['estado'], string> = {
  sin_iniciar: 'bg-gray-100 text-gray-600', en_estudio: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700', rechazado: 'bg-red-100 text-red-700',
}

const FORMA_OPCIONES: { value: FormaPago; label: string }[] = [
  { value: 'contado',    label: 'Contado' },
  { value: 'credito',    label: 'Crédito' },
  { value: 'credito_ci', label: 'Crédito & C. Inicial' },
]

export default function PagoTab({ clienteId, tenantId, usuarioId, onCreditoChange }: Props) {
  const supabase = createClient()

  /* ── Estado forma de pago ── */
  const [formaPago, setFormaPago]           = useState<FormaPago>('')
  const [cuotaInicialSi, setCuotaInicialSi] = useState(false)
  const [cuotaInicial, setCuotaInicial]     = useState('')
  const [cuotaDeseada, setCuotaDeseada]     = useState('')
  const [plazoMeses, setPlazoMeses]         = useState('')
  const [entidades, setEntidades]           = useState<Entidad[]>([])
  const [estudios, setEstudios]             = useState<Estudio[]>([])
  const [totalMotos, setTotalMotos]         = useState(0)
  const [saving, setSaving]                 = useState(false)

  /* ── Estado bonos ── */
  const [bonosCatalogo, setBonosCatalogo]   = useState<Bono[]>([])
  const [bonosAplicados, setBonosAplicados] = useState<BonoAplicado[]>([])

  /* ── Estado pagos registrados ── */
  const [pagos, setPagos]                   = useState<PagoRegistrado[]>([])
  const [showFormPago, setShowFormPago]     = useState(false)
  const [formRecibo, setFormRecibo]         = useState('')
  const [formMonto, setFormMonto]           = useState('')
  const [formMetodo, setFormMetodo]         = useState('')
  const [formFecha, setFormFecha]           = useState(() => new Date().toISOString().slice(0, 10))
  const [savingPago, setSavingPago]         = useState(false)

  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: cliente }, { data: ent }, { data: est }, { data: motos }, { data: pagosList }, { data: tenant }, { data: bns }, { data: bnsAp }] =
      await Promise.all([
        supabase.from('clientes')
          .select('forma_pago, credito_tiene_cuota_inicial, cuota_inicial, cuota_deseada, plazo_meses')
          .eq('id', clienteId).single(),
        supabase.from('entidades_financieras').select('id, nombre').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
        supabase.from('clientes_credito_estudio').select('id, entidad_id, estado, monto_aprobado, bono').eq('cliente_id', clienteId),
        supabase.from('clientes_motos_interes')
          .select('disponibilidad, con_papeles, con_tarjeta, pignorada, motos_catalogo(precio, costo_documentos, costo_prenda)')
          .eq('cliente_id', clienteId),
        supabase.from('clientes_pagos').select('id, codigo_factura, monto, metodo_pago, created_at').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
        supabase.from('tenants').select('recargo_tarjeta_porcentaje').eq('id', tenantId).single(),
        supabase.from('bonos').select('id, nombre').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
        supabase.from('clientes_bonos').select('id, bono_id, monto').eq('cliente_id', clienteId),
      ])

    if (cliente) {
      setFormaPago((cliente.forma_pago ?? '') as FormaPago)
      setCuotaInicialSi(!!cliente.credito_tiene_cuota_inicial)
      setCuotaInicial(cliente.cuota_inicial?.toString() ?? '')
      setCuotaDeseada(cliente.cuota_deseada?.toString() ?? '')
      setPlazoMeses(cliente.plazo_meses?.toString() ?? '')
    }
    setEntidades((ent ?? []) as Entidad[])
    setEstudios((est ?? []) as Estudio[])
    setPagos((pagosList ?? []) as PagoRegistrado[])
    setBonosCatalogo((bns ?? []) as Bono[])
    setBonosAplicados((bnsAp ?? []) as BonoAplicado[])

    const recargoTarjeta = Number(tenant?.recargo_tarjeta_porcentaje ?? 5)
    const total = (motos ?? []).reduce((s, m) => {
      const mc = Array.isArray(m.motos_catalogo) ? m.motos_catalogo[0] : m.motos_catalogo
      if (!mc) return s
      return s + calcularPrecioMoto(mc, m.con_papeles, m.con_tarjeta, m.pignorada, recargoTarjeta)
    }, 0)
    setTotalMotos(total)
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  const totalPagado = useMemo(() => pagos.reduce((s, p) => s + (p.monto ?? 0), 0), [pagos])

  /* ── Auto-guardar forma de pago ── */
  async function guardarFormaPago(nueva: FormaPago) {
    setSaving(true)
    try {
      await supabase.from('clientes').update({
        forma_pago: nueva || null,
        credito_tiene_cuota_inicial: nueva === 'credito_ci' ? true : null,
      }).eq('id', clienteId)
    } finally { setSaving(false) }
  }

  async function guardarCuotas() {
    const esCredito = formaPago === 'credito' || formaPago === 'credito_ci'
    await supabase.from('clientes').update({
      cuota_inicial: cuotaInicial ? parseFloat(cuotaInicial) : null,
      cuota_deseada: esCredito && cuotaDeseada ? parseFloat(cuotaDeseada) : null,
      plazo_meses: esCredito && plazoMeses ? parseInt(plazoMeses, 10) : null,
    }).eq('id', clienteId)
  }

  /* ── Bonos ── */
  async function toggleBono(bonoId: string, activo: boolean) {
    if (activo) {
      const { data } = await supabase.from('clientes_bonos')
        .insert({ cliente_id: clienteId, tenant_id: tenantId, bono_id: bonoId, monto: 0 })
        .select('id, bono_id, monto').single()
      if (data) setBonosAplicados(p => [...p, data as BonoAplicado])
    } else {
      const existente = bonosAplicados.find(b => b.bono_id === bonoId)
      if (!existente) return
      await supabase.from('clientes_bonos').delete().eq('id', existente.id)
      setBonosAplicados(p => p.filter(b => b.id !== existente.id))
    }
  }

  async function setMontoBono(bonoId: string, monto: string) {
    const existente = bonosAplicados.find(b => b.bono_id === bonoId)
    if (!existente) return
    const val = monto ? parseFloat(monto) : 0
    await supabase.from('clientes_bonos').update({ monto: val }).eq('id', existente.id)
    setBonosAplicados(p => p.map(b => b.id === existente.id ? { ...b, monto: val } : b))
  }

  /* ── Estudios de crédito ── */
  async function cambiarEstado(entidadId: string, estado: Estudio['estado']) {
    const existente = estudios.find(e => e.entidad_id === entidadId)
    if (existente) {
      await supabase.from('clientes_credito_estudio').update({ estado, actualizado_por: usuarioId, updated_at: new Date().toISOString() }).eq('id', existente.id)
    } else {
      await supabase.from('clientes_credito_estudio').insert({ cliente_id: clienteId, tenant_id: tenantId, entidad_id: entidadId, estado, actualizado_por: usuarioId })
    }
    cargar()
    if (onCreditoChange) {
      const updatedEstudios = estudios.map(e => e.entidad_id === entidadId ? { ...e, estado } : e)
      if (!existente) updatedEstudios.push({ id: '', entidad_id: entidadId, estado, monto_aprobado: null, bono: false })
      const aprobada = entidades.find(e => updatedEstudios.some(es => es.entidad_id === e.id && es.estado === 'aprobado'))?.nombre ?? null
      const rechazadas = entidades.filter(e => updatedEstudios.some(es => es.entidad_id === e.id && es.estado === 'rechazado')).map(e => e.nombre)
      onCreditoChange(aprobada, rechazadas)
    }
  }

  async function setMonto(entidadId: string, monto: string) {
    const existente = estudios.find(e => e.entidad_id === entidadId)
    if (!existente) return
    await supabase.from('clientes_credito_estudio').update({ monto_aprobado: monto ? parseFloat(monto) : null }).eq('id', existente.id)
    setEstudios(p => p.map(e => e.id === existente.id ? { ...e, monto_aprobado: monto ? parseFloat(monto) : null } : e))
  }

  async function setBonoEstudio(entidadId: string, bono: boolean) {
    const existente = estudios.find(e => e.entidad_id === entidadId)
    if (!existente) return
    await supabase.from('clientes_credito_estudio').update({ bono }).eq('id', existente.id)
    setEstudios(p => p.map(e => e.id === existente.id ? { ...e, bono } : e))
  }

  /* ── Pagos registrados ── */
  async function agregarPago() {
    if (!formMonto || isNaN(parseFloat(formMonto))) return
    setSavingPago(true)
    try {
      await supabase.from('clientes_pagos').insert({
        cliente_id:     clienteId,
        tenant_id:      tenantId,
        codigo_factura: formRecibo || null,
        monto:          parseFloat(formMonto),
        metodo_pago:    formMetodo || null,
        created_at:     new Date(`${formFecha}T12:00:00`).toISOString(),
        created_by:     usuarioId,
      })
      setFormRecibo(''); setFormMonto(''); setFormMetodo(''); setFormFecha(new Date().toISOString().slice(0, 10))
      setShowFormPago(false)
      await cargar()
    } catch {
      alert('No se pudo registrar el pago')
    } finally {
      setSavingPago(false)
    }
  }

  async function eliminarPago(id: string) {
    if (!confirm('¿Eliminar este pago?')) return
    await supabase.from('clientes_pagos').delete().eq('id', id)
    setPagos(p => p.filter(x => x.id !== id))
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  const esCredito = formaPago === 'credito' || formaPago === 'credito_ci'

  return (
    <div className="space-y-4">

      {/* ── FORMA DE PAGO ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Forma de pago
          {saving && <span className="ml-2 text-blue-400 font-normal normal-case text-[10px]">Guardando...</span>}
        </p>
        <div className="flex gap-2 flex-wrap">
          {FORMA_OPCIONES.map(opt => (
            <button key={opt.value}
              onClick={() => { setFormaPago(opt.value); guardarFormaPago(opt.value) }}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                formaPago === opt.value ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── BONOS ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bonos</p>
        {bonosCatalogo.length === 0 ? (
          <p className="text-xs text-gray-400">Sin bono (predeterminado). Configura bonos en Config Ventas → Bonos.</p>
        ) : (
          <div className="space-y-2">
            {bonosCatalogo.map(b => {
              const aplicado = bonosAplicados.find(x => x.bono_id === b.id)
              return (
                <div key={b.id} className="flex items-center gap-2">
                  <button onClick={() => toggleBono(b.id, !aplicado)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                      aplicado ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {b.nombre}
                  </button>
                  {aplicado && (
                    <MoneyInput value={aplicado.monto ? String(aplicado.monto) : ''}
                      onChange={raw => setBonosAplicados(p => p.map(x => x.id === aplicado.id ? { ...x, monto: raw ? parseFloat(raw) : 0 } : x))}
                      onCommit={raw => setMontoBono(b.id, raw)}
                      placeholder="Valor del bono"
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                </div>
              )
            })}
            {bonosAplicados.length === 0 && <p className="text-[11px] text-gray-400">Sin bono aplicado (predeterminado)</p>}
          </div>
        )}
      </div>

      {/* ── CONTADO: valor de referencia, ya definido en Motos de interés ── */}
      {formaPago === 'contado' && (
        <div className="border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">Valor total a pagar de contado</p>
          <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatCOP(totalMotos)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Definido en Motos de interés</p>
        </div>
      )}

      {/* ── DETALLES CRÉDITO ── */}
      {esCredito && (
        <div className="space-y-2 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-400">Referencia motos: {formatCOP(totalMotos)}</p>
          {formaPago === 'credito_ci' && (
            <div>
              <label className="text-xs text-gray-500">Cuota inicial (COP)</label>
              <MoneyInput value={cuotaInicial} onChange={setCuotaInicial} onCommit={guardarCuotas}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Cuota mensual estimada (COP)</label>
            <MoneyInput value={cuotaDeseada} onChange={setCuotaDeseada} onCommit={guardarCuotas}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Plazo estimado en meses</label>
            <input type="number" value={plazoMeses} onChange={e => setPlazoMeses(e.target.value)}
              onBlur={guardarCuotas}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>
        </div>
      )}

      {/* ── PAGOS REGISTRADOS ── */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Pagos registrados
            {pagos.length > 0 && <span className="ml-1.5 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium normal-case">{pagos.length}</span>}
          </p>
          <button onClick={() => setShowFormPago(v => !v)}
            className="text-xs text-blue-700 font-semibold hover:text-blue-900 flex items-center gap-1">
            {showFormPago ? '✕ Cancelar' : '+ Agregar pago'}
          </button>
        </div>

        {/* Formulario nuevo pago */}
        {showFormPago && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Recibo de caja</p>

            <input value={formRecibo} onChange={e => setFormRecibo(e.target.value)}
              placeholder="N° de recibo de caja"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <select value={formMetodo} onChange={e => setFormMetodo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Método de pago</option>
              {METODOS_PAGO_FIJOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <MoneyInput value={formMonto} onChange={setFormMonto}
              placeholder="Monto *"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <button onClick={agregarPago} disabled={!formMonto || savingPago}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
              {savingPago ? 'Guardando...' : '✓ Guardar pago'}
            </button>
          </div>
        )}

        {/* Lista de pagos */}
        {pagos.length === 0 && !showFormPago && (
          <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">Sin pagos registrados</p>
        )}

        {pagos.length > 0 && (
          <div className="space-y-1.5">
            {pagos.map(p => {
              const fecha = new Date(p.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
              return (
                <div key={p.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.codigo_factura && (
                        <span className="text-[10px] text-gray-400 font-mono">Recibo {p.codigo_factura}</span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">{fecha}</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCOP(p.monto)}</p>
                    {p.metodo_pago && <p className="text-xs text-gray-400">{p.metodo_pago}</p>}
                  </div>
                  <button onClick={() => eliminarPago(p.id)}
                    className="flex-shrink-0 text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              )
            })}

            {/* Total pagado */}
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mt-1">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Total pagado</p>
              <p className="text-sm font-bold text-emerald-800">{formatCOP(totalPagado)}</p>
            </div>
            {totalMotos > 0 && totalPagado < totalMotos && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-0.5">
                <p className="text-xs text-amber-700 font-semibold">Saldo pendiente</p>
                <p className="text-sm font-bold text-amber-800">{formatCOP(totalMotos - totalPagado)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ESTUDIO DE CRÉDITO POR ENTIDAD (siempre visible) ── */}
      <div className="border-t border-gray-100 pt-4 border border-gray-200 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estudio de crédito por entidad</p>
        {entidades.length === 0 && <p className="text-xs text-gray-400">No hay entidades configuradas (Config Ventas → Entidades financieras).</p>}
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
                <div className="mt-1.5 space-y-1.5">
                  <MoneyInput value={est?.monto_aprobado != null ? String(est.monto_aprobado) : ''}
                    onChange={raw => setEstudios(p => p.map(e => e.entidad_id === ent.id ? { ...e, monto_aprobado: raw ? parseFloat(raw) : null } : e))}
                    onCommit={raw => setMonto(ent.id, raw)}
                    placeholder="Monto aprobado"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Bono:</span>
                    <button onClick={() => setBonoEstudio(ent.id, true)}
                      className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                        est?.bono ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>Sí</button>
                    <button onClick={() => setBonoEstudio(ent.id, false)}
                      className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                        !est?.bono ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>No</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
