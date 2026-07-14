'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type MetodoPago    = { id: string; nombre: string; recargo_porcentaje: number }
type Entidad       = { id: string; nombre: string }
type Estudio       = { id: string; entidad_id: string; estado: 'sin_iniciar' | 'en_estudio' | 'aprobado' | 'rechazado'; monto_aprobado: number | null }
type CategoriaPago = { id: string; nombre: string }
type PagoRegistrado = {
  id: string
  categoria_id: string | null
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

export default function PagoTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()

  /* ── Estado forma de pago ── */
  const [formaPago, setFormaPago]           = useState<FormaPago>('')
  const [metodoPagoId, setMetodoPagoId]     = useState('')
  const [cuotaInicialSi, setCuotaInicialSi] = useState(false)
  const [cuotaInicial, setCuotaInicial]     = useState('')
  const [cuotaDeseada, setCuotaDeseada]     = useState('')
  const [metodos, setMetodos]               = useState<MetodoPago[]>([])
  const [entidades, setEntidades]           = useState<Entidad[]>([])
  const [estudios, setEstudios]             = useState<Estudio[]>([])
  const [totalMotos, setTotalMotos]         = useState(0)
  const [saving, setSaving]                 = useState(false)

  /* ── Estado pagos registrados ── */
  const [categorias, setCategorias]         = useState<CategoriaPago[]>([])
  const [pagos, setPagos]                   = useState<PagoRegistrado[]>([])
  const [showFormPago, setShowFormPago]     = useState(false)
  const [formCat, setFormCat]               = useState('')
  const [formFactura, setFormFactura]       = useState('')
  const [formMonto, setFormMonto]           = useState('')
  const [formMetodo, setFormMetodo]         = useState('')
  const [savingPago, setSavingPago]         = useState(false)

  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: cliente }, { data: met }, { data: ent }, { data: est }, { data: motos }, { data: cats }, { data: pagosList }] =
      await Promise.all([
        supabase.from('clientes')
          .select('forma_pago, metodo_pago_id, credito_tiene_cuota_inicial, cuota_inicial, cuota_deseada')
          .eq('id', clienteId).single(),
        supabase.from('metodos_pago').select('id, nombre, recargo_porcentaje').eq('tenant_id', tenantId).eq('activo', true),
        supabase.from('entidades_financieras').select('id, nombre').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
        supabase.from('clientes_credito_estudio').select('id, entidad_id, estado, monto_aprobado').eq('cliente_id', clienteId),
        supabase.from('clientes_motos_interes').select('disponibilidad, motos_catalogo(precio, costo_documentos, costo_prenda)').eq('cliente_id', clienteId),
        supabase.from('categorias_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
        supabase.from('clientes_pagos').select('id, categoria_id, codigo_factura, monto, metodo_pago, created_at').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      ])

    if (cliente) {
      setFormaPago((cliente.forma_pago ?? '') as FormaPago)
      setMetodoPagoId(cliente.metodo_pago_id ?? '')
      setCuotaInicialSi(!!cliente.credito_tiene_cuota_inicial)
      setCuotaInicial(cliente.cuota_inicial?.toString() ?? '')
      setCuotaDeseada(cliente.cuota_deseada?.toString() ?? '')
    }
    setMetodos((met ?? []) as MetodoPago[])
    setEntidades((ent ?? []) as Entidad[])
    setEstudios((est ?? []) as Estudio[])
    setCategorias((cats ?? []) as CategoriaPago[])
    setPagos((pagosList ?? []) as PagoRegistrado[])

    const esCredito = ['credito', 'credito_ci'].includes(cliente?.forma_pago ?? '')
    const total = (motos ?? []).reduce((s, m) => {
      const mc = Array.isArray(m.motos_catalogo) ? m.motos_catalogo[0] : m.motos_catalogo
      if (!mc) return s
      return s + mc.precio + mc.costo_documentos + (esCredito ? mc.costo_prenda : 0)
    }, 0)
    setTotalMotos(total)
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  const recargo   = useMemo(() => metodos.find(m => m.id === metodoPagoId)?.recargo_porcentaje ?? 0, [metodos, metodoPagoId])
  const totalFinal = useMemo(() => totalMotos * (1 + recargo / 100), [totalMotos, recargo])
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
    await supabase.from('clientes').update({
      cuota_inicial: cuotaInicial ? parseFloat(cuotaInicial) : null,
      cuota_deseada: (formaPago === 'credito' || formaPago === 'credito_ci') && cuotaDeseada ? parseFloat(cuotaDeseada) : null,
    }).eq('id', clienteId)
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
  }

  async function setMonto(entidadId: string, monto: string) {
    const existente = estudios.find(e => e.entidad_id === entidadId)
    if (!existente) return
    await supabase.from('clientes_credito_estudio').update({ monto_aprobado: monto ? parseFloat(monto) : null }).eq('id', existente.id)
    setEstudios(p => p.map(e => e.id === existente.id ? { ...e, monto_aprobado: monto ? parseFloat(monto) : null } : e))
  }

  /* ── Pagos registrados ── */
  async function agregarPago() {
    if (!formMonto || isNaN(parseFloat(formMonto))) return
    setSavingPago(true)
    try {
      await supabase.from('clientes_pagos').insert({
        cliente_id:     clienteId,
        tenant_id:      tenantId,
        categoria_id:   formCat || null,
        codigo_factura: formFactura || null,
        monto:          parseFloat(formMonto),
        metodo_pago:    formMetodo || null,
        created_by:     usuarioId,
      })
      setFormCat(''); setFormFactura(''); setFormMonto(''); setFormMetodo('')
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

      {/* ── CONTADO: solo valor total ── */}
      {formaPago === 'contado' && (
        <div className="space-y-2 border border-gray-200 rounded-xl p-3">
          {totalMotos > 0 && (
            <p className="text-xs text-gray-400">Referencia motos: {formatCOP(totalMotos)}</p>
          )}
          <div>
            <label className="text-xs text-gray-500">Valor total a pagar de contado (COP)</label>
            <input type="number" value={cuotaInicial} onChange={e => setCuotaInicial(e.target.value)}
              onBlur={guardarCuotas}
              placeholder={totalMotos > 0 ? String(totalMotos) : '0'}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>
        </div>
      )}

      {/* ── DETALLES CRÉDITO ── */}
      {esCredito && (
        <div className="space-y-2 border border-gray-200 rounded-xl p-3">
          {formaPago === 'credito_ci' && (
            <div>
              <label className="text-xs text-gray-500">Monto cuota inicial (COP)</label>
              <input type="number" value={cuotaInicial} onChange={e => setCuotaInicial(e.target.value)}
                onBlur={guardarCuotas}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Cuota mensual deseada (COP)</label>
            <input type="number" value={cuotaDeseada} onChange={e => setCuotaDeseada(e.target.value)}
              onBlur={guardarCuotas}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
          </div>
        </div>
      )}

      {/* ── ESTUDIO DE CRÉDITO POR ENTIDAD (siempre visible) ── */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
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
                <input type="number" placeholder="Monto aprobado" defaultValue={est?.monto_aprobado ?? ''}
                  onBlur={e => setMonto(ent.id, e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs mt-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>
          )
        })}
      </div>

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
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Nuevo pago</p>

            <select value={formCat} onChange={e => setFormCat(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Categoría (opcional)</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              {categorias.length === 0 && <option disabled>No hay categorías — configúralas en Config Ventas</option>}
            </select>

            <input value={formFactura} onChange={e => setFormFactura(e.target.value)}
              placeholder="Código de factura (opcional)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <input type="number" value={formMonto} onChange={e => setFormMonto(e.target.value)}
              placeholder="Monto *"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <select value={formMetodo} onChange={e => setFormMetodo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Método de pago (opcional)</option>
              {metodos.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
              {metodos.length === 0 && <option disabled>Sin métodos — agrégalos en Config Ventas</option>}
            </select>

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
              const catNombre = categorias.find(c => c.id === p.categoria_id)?.nombre
              const fecha = new Date(p.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
              return (
                <div key={p.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {catNombre && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">{catNombre}</span>
                      )}
                      {p.codigo_factura && (
                        <span className="text-[10px] text-gray-400 font-mono">{p.codigo_factura}</span>
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
            {totalFinal > 0 && totalPagado < totalFinal && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-0.5">
                <p className="text-xs text-amber-700 font-semibold">Saldo pendiente</p>
                <p className="text-sm font-bold text-amber-800">{formatCOP(totalFinal - totalPagado)}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
