'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type MotoCatalogo = { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number }
type Seleccion = { id: string; moto_catalogo_id: string; disponibilidad: 'inventario' | 'pedir'; motos_catalogo: MotoCatalogo | null }

export default function MotosInteresTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [catalogo, setCatalogo]     = useState<MotoCatalogo[]>([])
  const [seleccion, setSeleccion]   = useState<Seleccion[]>([])
  const [agregando, setAgregando]   = useState('')
  const [loading, setLoading]       = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: cat }, { data: sel }] = await Promise.all([
      supabase.from('motos_catalogo').select('id, referencia, precio, costo_documentos, costo_prenda')
        .eq('tenant_id', tenantId).eq('activa', true).order('orden'),
      supabase.from('clientes_motos_interes')
        .select('id, moto_catalogo_id, disponibilidad, motos_catalogo(id, referencia, precio, costo_documentos, costo_prenda)')
        .eq('cliente_id', clienteId),
    ])
    setCatalogo((cat ?? []) as MotoCatalogo[])
    setSeleccion((sel ?? []).map(s => ({
      ...s,
      motos_catalogo: Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] ?? null : s.motos_catalogo,
    })) as Seleccion[])
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  const disponibles = catalogo.filter(c => !seleccion.some(s => s.moto_catalogo_id === c.id))

  async function sincronizarValorEstimado() {
    const { data: sel } = await supabase.from('clientes_motos_interes')
      .select('motos_catalogo(precio, costo_documentos)')
      .eq('cliente_id', clienteId)
    const total = (sel ?? []).reduce((acc, s) => {
      const m = Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] : s.motos_catalogo
      return acc + (m ? m.precio + m.costo_documentos : 0)
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

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Motos de interés</p>

      {seleccion.length === 0 && (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">Sin motos seleccionadas</p>
      )}

      {seleccion.map(s => {
        const m = s.motos_catalogo
        const precioConDocs = (m?.precio ?? 0) + (m?.costo_documentos ?? 0)
        return (
          <div key={s.id} className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm text-gray-900">{m?.referencia ?? 'Moto eliminada del catálogo'}</p>
              <button onClick={() => quitar(s.id)} className="text-red-400 hover:text-red-600 text-xs">Quitar</button>
            </div>
            {m && (
              <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                {formatCOP(precioConDocs)} con documentos
                <span className="text-gray-400 font-normal"> · con prenda: {formatCOP(precioConDocs + m.costo_prenda)}</span>
              </p>
            )}
            <div className="flex gap-2 mt-2">
              {(['inventario', 'pedir'] as const).map(opt => (
                <button key={opt} onClick={() => cambiarDisponibilidad(s.id, opt)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    s.disponibilidad === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {opt === 'inventario' ? 'En inventario' : 'Hay que pedirla'}
                </button>
              ))}
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
