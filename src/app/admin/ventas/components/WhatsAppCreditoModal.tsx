'use client'
import { useState, useMemo } from 'react'
import type { LeadData } from './LeadCard'

interface Props {
  leads: LeadData[]
  onClose: () => void
}

type Filtro = 'todos' | 'en_estudio' | 'aprobados' | 'rechazados'

const FILTROS: { id: Filtro; label: string; color: string }[] = [
  { id: 'todos',      label: 'Todos',        color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { id: 'en_estudio', label: 'En estudio',   color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { id: 'aprobados',  label: 'Aprobados',    color: 'bg-green-100 text-green-700 border-green-300' },
  { id: 'rechazados', label: 'Con rechazos', color: 'bg-red-100 text-red-600 border-red-300' },
]

const ETAPAS_CREDITO = ['buscando_credito', 'en_proceso_credito']

function formatCliente(lead: LeadData): string {
  const nombre  = lead.cliente?.nombre ?? '[Pendiente]'
  const cedula  = lead.cliente_documento ?? '[Pendiente]'
  const celular = lead.cliente?.celular ?? '[Pendiente]'
  const correo  = lead.cliente_email ?? '[Pendiente]'
  return `*${nombre}*\nCédula: ${cedula}\nCelular: ${celular}\nCorreo: ${correo}`
}

export default function WhatsAppCreditoModal({ leads, onClose }: Props) {
  const [filtro, setFiltro]               = useState<Filtro>('en_estudio')
  const [entidadFiltro, setEntidadFiltro] = useState<string>('todas')
  const [busqueda, setBusqueda]           = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    () => new Set(leads.filter(l => ETAPAS_CREDITO.includes(l.etapa_venta)).map(l => l.id))
  )
  const [copiado, setCopiado] = useState<string | null>(null)

  // Entidades únicas presentes en los leads (aprobadas o rechazadas)
  const entidadesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) {
      if (l.creditoAprobadoEntidad) set.add(l.creditoAprobadoEntidad)
      for (const r of l.creditoRechazadoEntidades ?? []) set.add(r)
    }
    return [...set].sort()
  }, [leads])

  // Leads visibles según el filtro activo
  const leadsFiltrados = useMemo(() => {
    let lista = leads
    switch (filtro) {
      case 'en_estudio': lista = leads.filter(l => ETAPAS_CREDITO.includes(l.etapa_venta)); break
      case 'aprobados':  lista = leads.filter(l => !!l.creditoAprobadoEntidad); break
      case 'rechazados': lista = leads.filter(l => (l.creditoRechazadoEntidades?.length ?? 0) > 0); break
    }
    if (entidadFiltro !== 'todas') {
      lista = lista.filter(l =>
        l.creditoAprobadoEntidad === entidadFiltro ||
        l.creditoRechazadoEntidades?.includes(entidadFiltro)
      )
    }
    return lista
  }, [leads, filtro, entidadFiltro])

  // Búsqueda por nombre sobre los leads ya filtrados
  const leadsVisibles = useMemo(() => {
    if (!busqueda.trim()) return leadsFiltrados
    const q = busqueda.toLowerCase()
    return leadsFiltrados.filter(l =>
      (l.cliente?.nombre ?? '').toLowerCase().includes(q) ||
      (l.cliente_documento ?? '').includes(q) ||
      (l.cliente?.celular ?? '').includes(q)
    )
  }, [leadsFiltrados, busqueda])

  // Cuando cambia el filtro, auto-seleccionar los leads visibles
  function aplicarFiltro(f: Filtro) {
    setFiltro(f)
    // recalcula inline para no esperar el useMemo
    let lista = leads
    switch (f) {
      case 'en_estudio': lista = leads.filter(l => ETAPAS_CREDITO.includes(l.etapa_venta)); break
      case 'aprobados':  lista = leads.filter(l => !!l.creditoAprobadoEntidad); break
      case 'rechazados': lista = leads.filter(l => (l.creditoRechazadoEntidades?.length ?? 0) > 0); break
    }
    if (entidadFiltro !== 'todas') {
      lista = lista.filter(l =>
        l.creditoAprobadoEntidad === entidadFiltro ||
        l.creditoRechazadoEntidades?.includes(entidadFiltro)
      )
    }
    setSeleccionados(new Set(lista.map(l => l.id)))
  }

  function aplicarEntidad(e: string) {
    setEntidadFiltro(e)
    let lista = leads
    switch (filtro) {
      case 'en_estudio': lista = leads.filter(l => ETAPAS_CREDITO.includes(l.etapa_venta)); break
      case 'aprobados':  lista = leads.filter(l => !!l.creditoAprobadoEntidad); break
      case 'rechazados': lista = leads.filter(l => (l.creditoRechazadoEntidades?.length ?? 0) > 0); break
    }
    if (e !== 'todas') {
      lista = lista.filter(l =>
        l.creditoAprobadoEntidad === e ||
        l.creditoRechazadoEntidades?.includes(e)
      )
    }
    setSeleccionados(new Set(lista.map(l => l.id)))
  }

  function toggle(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const leadsSeleccionados = leadsFiltrados.filter(l => seleccionados.has(l.id))
  const visiblesSeleccionados = leadsVisibles.filter(l => seleccionados.has(l.id)).length
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Lista para WhatsApp</h2>
            <p className="text-xs text-gray-500 mt-0.5">Clientes para enviar al estudio de crédito</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors">
            ×
          </button>
        </div>

        {/* Filtros */}
        <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
          {/* Filtro por estado de crédito */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTROS.map(f => (
              <button
                key={f.id}
                onClick={() => aplicarFiltro(f.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  filtro === f.id
                    ? f.color + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Filtro por entidad (solo si hay entidades con datos) */}
          {entidadesDisponibles.length > 0 && (
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Entidad:</span>
              <button
                onClick={() => aplicarEntidad('todas')}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  entidadFiltro === 'todas'
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                }`}>
                Todas
              </button>
              {entidadesDisponibles.map(e => (
                <button
                  key={e}
                  onClick={() => aplicarEntidad(e)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    entidadFiltro === e
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Buscador */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, cédula o celular..."
              className="w-full pl-7 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none">
                ×
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500">
              {leadsVisibles.length} cliente{leadsVisibles.length !== 1 ? 's' : ''}
              {busqueda.trim() && ` de ${leadsFiltrados.length}`}
              {' · '}{visiblesSeleccionados} seleccionado{visiblesSeleccionados !== 1 ? 's' : ''}
              {seleccionados.size > visiblesSeleccionados && ` (+${seleccionados.size - visiblesSeleccionados} fuera del filtro)`}
            </span>
            <div className="flex gap-3">
              <button onClick={() => setSeleccionados(prev => new Set([...prev, ...leadsVisibles.map(l => l.id)]))}
                className="text-xs text-blue-600 hover:underline font-medium">Todos</button>
              <button onClick={() => setSeleccionados(prev => { const next = new Set(prev); leadsVisibles.forEach(l => next.delete(l.id)); return next })}
                className="text-xs text-gray-500 hover:underline">Ninguno</button>
            </div>
          </div>

          {leadsVisibles.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              {busqueda.trim() ? 'Sin resultados para esa búsqueda' : 'Sin clientes para este filtro'}
            </p>
          )}

          {leadsVisibles.map(lead => {
            const sel  = seleccionados.has(lead.id)
            const texto = formatCliente(lead)
            const aprobada  = lead.creditoAprobadoEntidad
            const rechazadas = lead.creditoRechazadoEntidades ?? []
            return (
              <div key={lead.id}
                className={`rounded-xl border p-3 transition-colors cursor-pointer select-none ${
                  sel ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => toggle(lead.id)}>
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={sel} onChange={() => toggle(lead.id)}
                    onClick={e => e.stopPropagation()} className="mt-0.5 flex-shrink-0 rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {lead.cliente?.nombre ?? '— Sin nombre —'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lead.cliente_documento ? `CC ${lead.cliente_documento}` : 'Cédula: [Pendiente]'}
                      {' · '}
                      {lead.cliente?.celular ?? '[Sin celular]'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{lead.cliente_email ?? '[Sin correo]'}</p>
                    {/* Badges crédito */}
                    {(aprobada || rechazadas.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aprobada && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
                            ✓ {aprobada}
                          </span>
                        )}
                        {rechazadas.map(r => (
                          <span key={r} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 line-through">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
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

        {/* Footer */}
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
