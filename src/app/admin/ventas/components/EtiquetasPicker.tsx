'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Etiqueta = { id: string; nombre: string; color: string }

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#84cc16',
]

interface Props {
  tenantId: string
  clienteId: string
  etiquetasIniciales: Etiqueta[]
  onChange: (etiquetas: Etiqueta[]) => void
}

export default function EtiquetasPicker({ tenantId, clienteId, etiquetasIniciales, onChange }: Props) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [todas, setTodas] = useState<Etiqueta[]>([])
  const [aplicadas, setAplicadas] = useState<Etiqueta[]>(etiquetasIniciales)
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    supabase.from('etiquetas_venta').select('id, nombre, color')
      .eq('tenant_id', tenantId).order('nombre')
      .then(({ data }) => setTodas((data ?? []) as Etiqueta[]))
    setTimeout(() => inputRef.current?.focus(), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
        setBusqueda('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const aplicadasIds = new Set(aplicadas.map(e => e.id))
  const busquedaNorm = busqueda.toLowerCase().trim()
  const filtradas = todas.filter(e => e.nombre.toLowerCase().includes(busquedaNorm))
  const existeExacta = todas.some(e => e.nombre.toLowerCase() === busquedaNorm)

  async function toggleEtiqueta(e: Etiqueta) {
    if (aplicadasIds.has(e.id)) {
      await supabase.from('clientes_etiquetas').delete()
        .eq('cliente_id', clienteId).eq('etiqueta_id', e.id)
      const nuevas = aplicadas.filter(a => a.id !== e.id)
      setAplicadas(nuevas)
      onChange(nuevas)
    } else {
      await supabase.from('clientes_etiquetas')
        .insert({ cliente_id: clienteId, etiqueta_id: e.id, tenant_id: tenantId })
      const nuevas = [...aplicadas, e]
      setAplicadas(nuevas)
      onChange(nuevas)
    }
  }

  async function crearYAplicar() {
    const nombre = busqueda.trim()
    if (!nombre || existeExacta || creando) return
    setCreando(true)
    const color = PALETTE[todas.length % PALETTE.length]
    const { data, error } = await supabase.from('etiquetas_venta')
      .insert({ tenant_id: tenantId, nombre, color })
      .select('id, nombre, color').single()
    if (error || !data) { setCreando(false); return }
    const nueva = data as Etiqueta
    await supabase.from('clientes_etiquetas')
      .insert({ cliente_id: clienteId, etiqueta_id: nueva.id, tenant_id: tenantId })
    const nuevas = [...aplicadas, nueva]
    setAplicadas(nuevas)
    setTodas(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    onChange(nuevas)
    setBusqueda('')
    setCreando(false)
  }

  async function quitar(e: Etiqueta, ev: React.MouseEvent) {
    ev.stopPropagation()
    await supabase.from('clientes_etiquetas').delete()
      .eq('cliente_id', clienteId).eq('etiqueta_id', e.id)
    const nuevas = aplicadas.filter(a => a.id !== e.id)
    setAplicadas(nuevas)
    onChange(nuevas)
  }

  return (
    <div className="relative inline-block" ref={dropRef}>
      <div className="flex items-center gap-1 flex-wrap">
        {aplicadas.map(e => (
          <span key={e.id}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full text-white leading-tight"
            style={{ background: e.color }}>
            {e.nombre}
            <button
              onClick={ev => quitar(e, ev)}
              className="opacity-70 hover:opacity-100 leading-none ml-0.5"
              title="Quitar etiqueta">
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(o => !o)}
          className="text-[11px] text-gray-400 hover:text-blue-600 border border-dashed border-gray-300 hover:border-blue-400 px-2 py-0.5 rounded-full transition-colors whitespace-nowrap">
          + Etiqueta
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-56 p-2">
          <input
            ref={inputRef}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') crearYAplicar() }}
            placeholder="Buscar o crear..."
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 mb-1.5"
          />
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtradas.map(e => (
              <button key={e.id} onClick={() => toggleEtiqueta(e)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-gray-50 transition-colors text-left">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.color }} />
                <span className="flex-1 text-gray-800 truncate">{e.nombre}</span>
                {aplicadasIds.has(e.id) && <span className="text-blue-600 text-[10px] font-bold">✓</span>}
              </button>
            ))}
            {busquedaNorm && !existeExacta && (
              <button onClick={crearYAplicar} disabled={creando}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-blue-700 hover:bg-blue-50 font-medium transition-colors disabled:opacity-40">
                <span className="text-blue-500 font-bold">+</span>
                {creando ? 'Creando...' : `Crear "${busqueda.trim()}"`}
              </button>
            )}
            {filtradas.length === 0 && !busquedaNorm && (
              <p className="text-xs text-gray-400 text-center py-3">Escribe para buscar o crear una etiqueta</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
