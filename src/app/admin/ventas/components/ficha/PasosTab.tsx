'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type Paso = { id: string; descripcion: string; completado: boolean; orden: number }

export default function PasosTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [pasos, setPasos]   = useState<Paso[]>([])
  const [nuevo, setNuevo]   = useState('')
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('clientes_pasos')
      .select('id, descripcion, completado, orden').eq('cliente_id', clienteId).order('orden')
    setPasos((data ?? []) as Paso[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    const d = nuevo.trim()
    if (!d) return
    await supabase.from('clientes_pasos').insert({
      cliente_id: clienteId, tenant_id: tenantId, descripcion: d, orden: pasos.length, created_by: usuarioId,
    })
    setNuevo('')
    cargar()
  }

  async function toggle(p: Paso) {
    await supabase.from('clientes_pasos').update({
      completado: !p.completado,
      completado_por: !p.completado ? usuarioId : null,
      completado_at: !p.completado ? new Date().toISOString() : null,
    }).eq('id', p.id)
    cargar()
  }

  async function eliminar(id: string) {
    await supabase.from('clientes_pasos').delete().eq('id', id)
    cargar()
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasos a seguir</p>

      <div className="flex gap-2">
        <input value={nuevo} onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') agregar() }}
          placeholder="ej: Confirmar dirección de entrega"
          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={agregar} disabled={!nuevo.trim()}
          className="px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
          + Agregar
        </button>
      </div>

      {pasos.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin pasos definidos</p>}

      <div className="space-y-1.5">
        {pasos.map(p => (
          <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <input type="checkbox" checked={p.completado} onChange={() => toggle(p)} className="flex-shrink-0" />
            <span className={`flex-1 text-sm ${p.completado ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {p.descripcion}
            </span>
            <button onClick={() => eliminar(p.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
