'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, calcularPrecioMoto } from '@/lib/ventas/pipeline'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type MotoCatalogo = { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number }
type Seleccion = {
  id: string
  moto_catalogo_id: string
  disponibilidad: 'inventario' | 'pedir'
  con_papeles: boolean
  con_tarjeta: boolean
  pignorada: boolean
  motos_catalogo: MotoCatalogo | null
}

export default function MotosInteresTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [catalogo, setCatalogo]     = useState<MotoCatalogo[]>([])
  const [seleccion, setSeleccion]   = useState<Seleccion[]>([])
  const [agregando, setAgregando]   = useState('')
  const [recargo, setRecargo]       = useState(5)
  const [descuentos, setDescuentos]         = useState('')
  const [lugarMatricula, setLugarMatricula] = useState('')
  const [loading, setLoading]       = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: cat }, { data: sel }, { data: tenant }, { data: cliente }] = await Promise.all([
      supabase.from('motos_catalogo').select('id, referencia, precio, costo_documentos, costo_prenda')
        .eq('tenant_id', tenantId).eq('activa', true).order('orden'),
      supabase.from('clientes_motos_interes')
        .select('id, moto_catalogo_id, disponibilidad, con_papeles, con_tarjeta, pignorada, motos_catalogo(id, referencia, precio, costo_documentos, costo_prenda)')
        .eq('cliente_id', clienteId),
      supabase.from('tenants').select('recargo_tarjeta_porcentaje').eq('id', tenantId).single(),
      supabase.from('clientes').select('descuentos, lugar_matricula').eq('id', clienteId).single(),
    ])
    setCatalogo((cat ?? []) as MotoCatalogo[])
    setSeleccion((sel ?? []).map(s => ({
      ...s,
      motos_catalogo: Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] ?? null : s.motos_catalogo,
    })) as Seleccion[])
    setRecargo(Number(tenant?.recargo_tarjeta_porcentaje ?? 5))
    setDescuentos(cliente?.descuentos ?? '')
    setLugarMatricula(cliente?.lugar_matricula ?? '')
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  const disponibles = catalogo.filter(c => !seleccion.some(s => s.moto_catalogo_id === c.id))

  async function sincronizarValorEstimado() {
    const { data: sel } = await supabase.from('clientes_motos_interes')
      .select('con_papeles, con_tarjeta, pignorada, motos_catalogo(precio, costo_documentos, costo_prenda)')
      .eq('cliente_id', clienteId)
    const total = (sel ?? []).reduce((acc, s) => {
      const m = Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] : s.motos_catalogo
      return acc + (m ? calcularPrecioMoto(m, s.con_papeles, s.con_tarjeta, s.pignorada, recargo) : 0)
    }, 0)
    await supabase.from('clientes').update({ valor_estimado_venta: total || null }).eq('id', clienteId)
  }

  async function agregar() {
    if (!agregando) return
    await supabase.from('clientes_motos_interes').insert({
      cliente_id: clienteId, moto_catalogo_id: agregando, disponibilidad: 'pedir', created_by: usuarioId,
    })
    setAgregando('')
    await sincronizarValorEstimado()
    cargar()
  }

  async function quitar(id: string) {
    await supabase.from('clientes_motos_interes').delete().eq('id', id)
    await sincronizarValorEstimado()
    cargar()
  }

  async function cambiarDisponibilidad(id: string, disponibilidad: 'inventario' | 'pedir') {
    await supabase.from('clientes_motos_interes').update({ disponibilidad }).eq('id', id)
    cargar()
  }

  async function cambiarOpcion(id: string, cambios: Partial<Pick<Seleccion, 'con_papeles' | 'con_tarjeta' | 'pignorada'>>) {
    await supabase.from('clientes_motos_interes').update(cambios).eq('id', id)
    await sincronizarValorEstimado()
    cargar()
  }

  async function guardarDescuentos() {
    await supabase.from('clientes').update({ descuentos: descuentos || null }).eq('id', clienteId)
  }

  async function guardarLugarMatricula() {
    await supabase.from('clientes').update({ lugar_matricula: lugarMatricula || null }).eq('id', clienteId)
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehículos de interés</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">Descuentos que le aplican</label>
          <input value={descuentos} onChange={e => setDescuentos(e.target.value)} onBlur={guardarDescuentos}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Lugar de matrícula</label>
          <input value={lugarMatricula} onChange={e => setLugarMatricula(e.target.value)} onBlur={guardarLugarMatricula}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
        </div>
      </div>

      {seleccion.length === 0 && (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">Sin motos seleccionadas</p>
      )}

      {seleccion.map(s => {
        const m = s.motos_catalogo
        const precio = m ? calcularPrecioMoto(m, s.con_papeles, s.con_tarjeta, s.pignorada, recargo) : 0
        return (
          <div key={s.id} className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                {s.disponibilidad === 'pedir' && <span title="Hay que pedirla">🚚</span>}
                {m?.referencia ?? 'Moto eliminada del catálogo'}
              </p>
              <button onClick={() => quitar(s.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">Quitar</button>
            </div>

            {m && (
              <p className="text-base text-emerald-700 font-bold mt-1">{formatCOP(precio)}</p>
            )}

            {/* Disponibilidad — bien notorio */}
            <div className="flex gap-1.5 mt-2">
              <button onClick={() => cambiarDisponibilidad(s.id, 'inventario')}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1 ${
                  s.disponibilidad === 'inventario' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                ✅ En inventario
              </button>
              <button onClick={() => cambiarDisponibilidad(s.id, 'pedir')}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1 ${
                  s.disponibilidad === 'pedir' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                🚚 Hay que pedirla
              </button>
            </div>

            {/* Papeles / Tarjeta / Pignorada — compacto */}
            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100">
              <button
                disabled={s.pignorada}
                onClick={() => cambiarOpcion(s.id, { con_papeles: !s.con_papeles })}
                className={`text-[11px] px-2 py-1 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  s.con_papeles ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                {s.con_papeles ? 'Con papeles' : 'Sin papeles'}
              </button>
              <button
                onClick={() => cambiarOpcion(s.id, { con_tarjeta: !s.con_tarjeta })}
                className={`text-[11px] px-2 py-1 rounded-full font-medium transition-colors ${
                  s.con_tarjeta ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                }`}>
                {s.con_tarjeta ? 'Con tarjeta' : 'Sin tarjeta'}
              </button>
              <button
                onClick={() => cambiarOpcion(s.id, s.pignorada ? { pignorada: false } : { pignorada: true, con_papeles: true })}
                className={`text-[11px] px-2 py-1 rounded-full font-medium transition-colors ${
                  s.pignorada ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                }`}>
                {s.pignorada ? 'Pignorada' : 'No pignorada'}
              </button>
            </div>
          </div>
        )
      })}

      <div className="flex gap-2 pt-1">
        <select value={agregando} onChange={e => setAgregando(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Selecciona una moto del catálogo...</option>
          {disponibles.map(c => <option key={c.id} value={c.id}>{c.referencia} · {formatCOP(c.precio)}</option>)}
        </select>
        <button onClick={agregar} disabled={!agregando}
          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
          + Agregar
        </button>
      </div>
    </div>
  )
}
