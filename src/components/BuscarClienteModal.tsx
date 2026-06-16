'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ClienteEncontrado = {
  id: string
  nombre: string
  cedula: string | null
  celular: string | null
  email: string | null
}

interface Props {
  tenantId: string
  onSelect: (cliente: ClienteEncontrado) => void
  onCancel: () => void
}

export function BuscarClienteModal({ tenantId, onSelect, onCancel }: Props) {
  const supabase  = createClient()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [texto, setTexto]           = useState('')
  const [resultados, setResultados] = useState<ClienteEncontrado[]>([])
  const [buscando, setBuscando]     = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const q = texto.trim()
    if (q.length < 2) { setResultados([]); return }

    const timer = setTimeout(async () => {
      setBuscando(true)
      // Búsqueda simultánea por nombre, cédula o celular
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, cedula, celular, email')
        .eq('tenant_id', tenantId)
        .is('fusionado_con_id', null)
        .or(`nombre.ilike.%${q}%,cedula.ilike.%${q}%,celular.ilike.%${q}%`)
        .order('nombre')
        .limit(8)

      setResultados((data ?? []) as ClienteEncontrado[])
      setBuscando(false)
    }, 260)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Buscar cliente existente</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-b relative">
          <input
            ref={inputRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Nombre, cédula o celular..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
          />
          {buscando && (
            <div className="absolute right-7 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Resultados */}
        <div className="overflow-y-auto max-h-72 p-3 space-y-1.5">
          {texto.length >= 2 && !buscando && resultados.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">
              Sin resultados · el cliente se creará nuevo al guardar
            </p>
          )}
          {texto.length < 2 && (
            <p className="text-center text-xs text-gray-400 py-4">Escribe al menos 2 caracteres</p>
          )}
          {resultados.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left rounded-xl border border-gray-200 px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <p className="font-semibold text-sm text-gray-900">{c.nombre}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {c.cedula  && <span className="text-xs text-gray-500">CC {c.cedula}</span>}
                {c.celular && <span className="text-xs text-gray-500">📞 {c.celular}</span>}
                {c.email   && <span className="text-xs text-gray-400">{c.email}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t">
          <button onClick={onCancel}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">
            Cancelar — registrar como cliente nuevo
          </button>
        </div>
      </div>
    </div>
  )
}
