'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { ETAPAS, ETAPA_MAP, formatCOP, estadoSeguimiento, esVenta, type EtapaVenta } from '@/lib/ventas/pipeline'

// Etapas cerradas: ya no necesitan seguimiento (mismo criterio que Vista Hoy).
const ETAPAS_CERRADAS: EtapaVenta[] = ['perdido', 'entregada', 'proceso_finalizado']
import type { LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'
import { useEtapasPipeline } from '@/hooks/useEtapasPipeline'

interface Props {
  leads: LeadData[]
  tenantId: string
  usuarios?: { id: string; nombre: string }[]
  onLeadPatch?: (id: string, patch: Record<string, unknown>) => void
  onLeadRemove?: (id: string) => void
}

type Orden = 'nombre' | 'etapa' | 'valor' | 'seguimiento'

const CANAL_BADGE: Record<string, string> = {
  whatsapp:  'bg-green-100 text-green-700',
  messenger: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  manual:    'bg-gray-100 text-gray-600',
}

export default function VistaLista({ leads, tenantId, usuarios = [], onLeadPatch, onLeadRemove }: Props) {
  const etapasPipeline = useEtapasPipeline(tenantId)
  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map(u => [u.id, u.nombre])), [usuarios])
  const [fichaId, setFichaId]         = useState<string | null>(null)
  const [busqueda, setBusqueda]       = useState('')
  const [etapaFiltro, setEtapaFiltro] = useState<EtapaVenta | 'todas' | 'activas'>('activas')
  const [canalFiltro, setCanalFiltro] = useState<string>('todos')
  const [ordenPor, setOrdenPor]       = useState<Orden>('seguimiento')
  const [asc, setAsc]                 = useState(true)
  const [leadsLocal, setLeadsLocal]   = useState<LeadData[]>(leads)

  useEffect(() => { setLeadsLocal(leads) }, [leads])

  const handleLeadUpdate = useCallback((id: string, updates: Record<string, unknown>) => {
    setLeadsLocal(prev => prev.map(l => {
      if (l.id !== id) return l
      const cp: Record<string, unknown> = {}
      if (updates.nombre  !== undefined) cp.nombre  = updates.nombre
      if (updates.celular !== undefined) cp.celular = updates.celular
      if (updates.placa   !== undefined) cp.placa   = updates.placa
      return {
        ...l,
        ...updates,
        ...(l.cliente && Object.keys(cp).length > 0 ? { cliente: { ...l.cliente, ...cp } } : {}),
      }
    }))
    onLeadPatch?.(id, updates)
  }, [onLeadPatch])

  const fichaLead = fichaId ? leadsLocal.find(l => l.id === fichaId) ?? null : null

  const canales = useMemo(
    () => [...new Set(leadsLocal.flatMap(l => l.todas_conversaciones.map(c => c.canal)))],
    [leadsLocal]
  )

  const filtrados = useMemo(() => {
    let r = leadsLocal

    if (busqueda) {
      const q = busqueda.toLowerCase()
      r = r.filter(l =>
        (l.cliente?.nombre ?? '').toLowerCase().includes(q) ||
        (l.cliente?.celular ?? '').includes(q) ||
        (l.moto_interes ?? '').toLowerCase().includes(q)
      )
    }

    if (etapaFiltro === 'activas') {
      r = r.filter(l => !ETAPAS_CERRADAS.includes(l.etapa_venta))
    } else if (etapaFiltro !== 'todas') {
      r = r.filter(l => l.etapa_venta === etapaFiltro)
    }

    if (canalFiltro !== 'todos') {
      r = r.filter(l => l.todas_conversaciones.some(c => c.canal === canalFiltro))
    }

    r = [...r].sort((a, b) => {
      let cmp = 0
      switch (ordenPor) {
        case 'nombre':
          cmp = (a.cliente?.nombre ?? '').localeCompare(b.cliente?.nombre ?? '')
          break
        case 'etapa':
          cmp = ETAPAS.findIndex(e => e.id === a.etapa_venta) - ETAPAS.findIndex(e => e.id === b.etapa_venta)
          break
        case 'valor':
          cmp = (b.valor_estimado_venta ?? 0) - (a.valor_estimado_venta ?? 0)
          break
        case 'seguimiento':
          cmp = (a.proxima_accion_fecha ?? '9999').localeCompare(b.proxima_accion_fecha ?? '9999')
          break
      }
      return asc ? cmp : -cmp
    })

    return r
  }, [leadsLocal, busqueda, etapaFiltro, canalFiltro, ordenPor, asc])

  function toggleOrden(campo: Orden) {
    if (ordenPor === campo) setAsc(p => !p)
    else { setOrdenPor(campo); setAsc(true) }
  }

  function Th({ campo, label }: { campo: Orden; label: string }) {
    return (
      <th
        onClick={() => toggleOrden(campo)}
        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
      >
        {label}
        {ordenPor === campo ? (asc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar nombre, celular, moto..."
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={etapaFiltro}
          onChange={e => setEtapaFiltro(e.target.value as EtapaVenta | 'todas' | 'activas')}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="activas">Solo activos</option>
          <option value="todas">Todas las etapas</option>
          {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select
          value={canalFiltro}
          onChange={e => setCanalFiltro(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todos">Todos los canales</option>
          {canales.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Resumen */}
      <p className="text-xs text-gray-400 mb-2 px-1">
        {filtrados.length} prospecto{filtrados.length !== 1 ? 's' : ''} · Total vendido:{' '}
        <span className="font-semibold text-emerald-700">
          {formatCOP(filtrados.filter(l => esVenta(l.etapa_venta)).reduce((s, l) => s + (l.valor_estimado_venta ?? 0), 0))}
        </span>
      </p>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th campo="nombre" label="Prospecto" />
              <Th campo="etapa"  label="Etapa" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Canal</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Asesor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Visible para</th>
              <Th campo="valor"       label="Valor estimado" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Moto</th>
              <Th campo="seguimiento" label="Próxima acción" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  No hay prospectos que coincidan con los filtros
                </td>
              </tr>
            )}
            {filtrados.map((lead, i) => {
              const etapaConfig = ETAPA_MAP[lead.etapa_venta]
              const seguim      = estadoSeguimiento(lead.proxima_accion_fecha)

              return (
                <tr key={lead.id}
                  onClick={() => setFichaId(lead.id)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-blue-50 ${
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  {/* Prospecto */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                        style={{ background: etapaConfig.color }}>
                        {(lead.cliente?.nombre ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 truncate max-w-[140px]">
                          {lead.cliente?.nombre ?? 'Sin nombre'}
                        </p>
                        {lead.no_leidos_count > 0 && (
                          <span className="text-xs text-green-600 font-semibold">
                            {lead.no_leidos_count} sin leer
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Etapa */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ background: etapaConfig.color }}>
                      {etapaConfig.label}
                    </span>
                  </td>

                  {/* Canales */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.todas_conversaciones.map(c => (
                        <span key={c.id} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CANAL_BADGE[c.canal] ?? 'bg-gray-100 text-gray-600'}`}>
                          {c.canal === 'whatsapp' ? '📱' : c.canal === 'instagram' ? '📸' : c.canal === 'messenger' ? '💬' : '✍️'}
                          {' '}{c.canal.charAt(0).toUpperCase() + c.canal.slice(1)}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Asesor */}
                  <td className="px-4 py-3">
                    {lead.assigned_to && usuariosMap[lead.assigned_to] ? (
                      <span className="text-xs font-semibold text-blue-700 truncate max-w-[110px] block">
                        {usuariosMap[lead.assigned_to]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Sin asignar</span>
                    )}
                  </td>

                  {/* Visible para (colaboradores) */}
                  <td className="px-4 py-3">
                    {lead.colaboradores?.length ? (
                      <div className="flex flex-wrap gap-1 max-w-[140px]">
                        {lead.colaboradores.map(c => (
                          <span key={c.id} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 truncate max-w-[90px]">
                            {c.nombre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* Valor */}
                  <td className="px-4 py-3 font-semibold text-emerald-700 text-sm">
                    {formatCOP(lead.valor_estimado_venta)}
                  </td>

                  {/* Moto */}
                  <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">
                    {lead.moto_interes ?? '—'}
                  </td>

                  {/* Próxima acción */}
                  <td className="px-4 py-3">
                    {!lead.proxima_accion ? (
                      <span className="text-xs text-gray-400">Sin definir</span>
                    ) : (
                      <div>
                        <p className={`text-xs font-medium truncate max-w-[150px] ${
                          seguim === 'vencido' ? 'text-red-600' :
                          seguim === 'hoy'     ? 'text-amber-700' : 'text-gray-700'
                        }`}>
                          {lead.proxima_accion}
                        </p>
                        {lead.proxima_accion_fecha && (
                          <p className={`text-xs ${seguim === 'vencido' ? 'text-red-500' : 'text-gray-400'}`}>
                            {new Date(lead.proxima_accion_fecha).toLocaleDateString('es-CO', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3 text-gray-300 text-lg">›</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {fichaLead && (
        <FichaProspecto
          key={fichaLead.id}
          lead={fichaLead}
          tenantId={tenantId}
          onClose={() => setFichaId(null)}
          onEtapaChange={(id, etapa) => handleLeadUpdate(id, { etapa_venta: etapa })}
          onLeadUpdate={handleLeadUpdate}
          onLeadDelete={(id) => { setLeadsLocal(p => p.filter(l => l.id !== id)); setFichaId(null); onLeadRemove?.(id) }}
          etapasPipeline={etapasPipeline}
        />
      )}
    </>
  )
}
