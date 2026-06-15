'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type ClienteResultado = {
  id: string
  nombre: string
  celular: string | null
  email: string | null
  canales: string[]
}

const CANAL_ICON: Record<string, string> = {
  whatsapp:  '📱',
  instagram: '📸',
  messenger: '💬',
  manual:    '✍️',
}

interface Props {
  tenantId: string
  clienteOrigenId: string
  clienteOrigenNombre: string
  onConfirm: (clienteDestinoId: string, clienteDestinoNombre: string) => void
  onCancel: () => void
}

export default function VincularClienteModal({
  tenantId, clienteOrigenId, clienteOrigenNombre, onConfirm, onCancel,
}: Props) {
  const supabase    = createClient()
  const inputRef    = useRef<HTMLInputElement>(null)
  const [busqueda, setBusqueda]         = useState('')
  const [resultados, setResultados]     = useState<ClienteResultado[]>([])
  const [buscando, setBuscando]         = useState(false)
  const [seleccionado, setSeleccionado] = useState<ClienteResultado | null>(null)
  const [guardando, setGuardando]       = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const texto = busqueda.trim()
    if (texto.length < 2) { setResultados([]); return }

    const timer = setTimeout(async () => {
      setBuscando(true)
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, celular, email, conversaciones(canal)')
        .eq('tenant_id', tenantId)
        .is('fusionado_con_id', null)
        .neq('id', clienteOrigenId)
        .or(`nombre.ilike.%${texto}%,celular.ilike.%${texto}%`)
        .limit(8)

      const mapped: ClienteResultado[] = (data ?? []).map((c) => {
        const convArr = c.conversaciones as { canal: string }[] | null
        const canales = [...new Set((convArr ?? []).map(cv => cv.canal))]
        return { id: c.id, nombre: c.nombre, celular: c.celular, email: c.email, canales }
      })
      setResultados(mapped)
      setBuscando(false)
    }, 280)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  async function confirmar() {
    if (!seleccionado || guardando) return
    setGuardando(true)
    try {
      const res = await fetch('/api/admin/clientes/vincular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_origen_id:  clienteOrigenId,
          cliente_destino_id: seleccionado.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onConfirm(seleccionado.id, seleccionado.nombre)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al vincular')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900 text-base">Vincular a cliente existente</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Las conversaciones de <span className="font-semibold text-gray-700">{clienteOrigenNombre}</span> pasarán
            al cliente que selecciones. El perfil temporal se eliminará en 48h.
          </p>
        </div>

        {/* Búsqueda */}
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <input
              ref={inputRef}
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setSeleccionado(null) }}
              placeholder="Buscar por nombre o celular..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            />
            {buscando && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          {busqueda.length > 0 && busqueda.length < 2 && (
            <p className="text-xs text-gray-400 mt-1.5 px-1">Escribe al menos 2 caracteres</p>
          )}
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto max-h-72 p-3 space-y-1.5">
          {resultados.length === 0 && busqueda.length >= 2 && !buscando && (
            <p className="text-center text-sm text-gray-400 py-6">
              No se encontraron clientes con ese nombre o celular
            </p>
          )}
          {resultados.map(c => (
            <button
              key={c.id}
              onClick={() => setSeleccionado(prev => prev?.id === c.id ? null : c)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                seleccionado?.id === c.id
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{c.nombre}</p>
                  {c.celular && <p className="text-xs text-gray-500">{c.celular}</p>}
                  {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0 mt-0.5">
                  {c.canales.length === 0 && (
                    <span className="text-xs text-gray-300">Sin conv.</span>
                  )}
                  {c.canales.map(canal => (
                    <span key={canal} title={canal} className="text-base">
                      {CANAL_ICON[canal] ?? '💭'}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Confirmación */}
        {seleccionado && (
          <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
            <p className="text-xs text-blue-700 font-semibold mb-0.5">Confirmar vinculación</p>
            <p className="text-xs text-blue-600">
              Todas las conversaciones de <strong>{clienteOrigenNombre}</strong> pasarán a{' '}
              <strong>{seleccionado.nombre}</strong>.
              El perfil anterior se eliminará en 48h.
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2 px-5 py-4 border-t">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!seleccionado || guardando}
            className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {guardando ? 'Vinculando...' : 'Vincular cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
