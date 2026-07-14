'use client'
import { useState } from 'react'
import type { LeadData } from './LeadCard'

interface Props {
  leads: LeadData[]
  onClose: () => void
}

function formatCliente(lead: LeadData): string {
  const nombre = lead.cliente?.nombre ?? '[Pendiente]'
  const cedula = lead.cliente_documento ? lead.cliente_documento : '[Pendiente]'
  const celular = lead.cliente?.celular ?? '[Pendiente]'
  const correo = lead.cliente_email ?? '[Pendiente]'
  return `*${nombre}*\nCédula: ${cedula}\nCelular: ${celular}\nCorreo: ${correo}`
}

export default function WhatsAppCreditoModal({ leads, onClose }: Props) {
  const ETAPAS_CREDITO = ['buscando_credito', 'en_proceso_credito']

  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    () => new Set(leads.filter(l => ETAPAS_CREDITO.includes(l.etapa_venta)).map(l => l.id))
  )
  const [copiado, setCopiado] = useState<string | null>(null)

  function toggle(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const leadsSeleccionados = leads.filter(l => seleccionados.has(l.id))
  const textoTodos = leadsSeleccionados.map(formatCliente).join('\n\n')

  async function copiar(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopiado(key)
    setTimeout(() => setCopiado(null), 1800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Lista para WhatsApp</h2>
            <p className="text-xs text-gray-500 mt-0.5">Selecciona los clientes para enviar al estudio de crédito</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors">×</button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-3">
              <button onClick={() => setSeleccionados(new Set(leads.map(l => l.id)))}
                className="text-xs text-blue-600 hover:underline font-medium">Todos</button>
              <button onClick={() => setSeleccionados(new Set())}
                className="text-xs text-gray-500 hover:underline">Ninguno</button>
            </div>
          </div>

          {leads.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No hay clientes en seguimiento</p>
          )}

          {leads.map(lead => {
            const sel = seleccionados.has(lead.id)
            const texto = formatCliente(lead)
            return (
              <div key={lead.id}
                className={`rounded-xl border p-3 transition-colors cursor-pointer select-none ${
                  sel ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => toggle(lead.id)}>
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggle(lead.id)}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 flex-shrink-0 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {lead.cliente?.nombre ?? '— Sin nombre —'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lead.cliente_documento ? `CC ${lead.cliente_documento}` : 'Cédula: [Pendiente]'}
                      {' · '}
                      {lead.cliente?.celular ?? '[Sin celular]'}
                    </p>
                    <p className="text-xs text-gray-400">{lead.cliente_email ?? '[Sin correo]'}</p>
                  </div>
                  {sel && (
                    <button
                      onClick={e => { e.stopPropagation(); copiar(texto, lead.id) }}
                      className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                        copiado === lead.id
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                      }`}>
                      {copiado === lead.id ? '✓ Copiado' : 'Copiar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer — vista previa + copiar todos */}
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 rounded-b-2xl flex-shrink-0">
          {leadsSeleccionados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center">Selecciona al menos un cliente</p>
          ) : (
            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded-xl p-3 max-h-36 overflow-y-auto">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Vista previa</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{textoTodos}</pre>
              </div>
              <button
                onClick={() => copiar(textoTodos, 'todos')}
                className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  copiado === 'todos'
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-700 hover:bg-blue-800 text-white'
                }`}>
                {copiado === 'todos'
                  ? '✓ ¡Lista copiada!'
                  : `📋 Copiar lista completa (${leadsSeleccionados.length} cliente${leadsSeleccionados.length !== 1 ? 's' : ''})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
