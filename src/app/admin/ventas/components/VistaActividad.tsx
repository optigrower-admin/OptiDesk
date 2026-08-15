'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LeadData } from './LeadCard'
import type { EtapaDinamica } from '@/hooks/useEtapasPipeline'

interface Props {
  leads: LeadData[]
  tenantId: string
  etapaMap: Record<string, EtapaDinamica>
  onAbrirCliente: (id: string) => void
}

type TimelineItem = {
  id: string
  fecha: string
  icono: string
  accent: string // clase de color tailwind para el punto/borde
  texto: string
  usuarioNombre: string | null
}

const CAMPO_LABEL: Record<string, string> = {
  celular: 'Celular',
  placa: 'Placa',
  factura: 'N° Factura',
  numero_factura: 'N° Factura',
  asignado_a: 'Asesor asignado',
  nombre: 'Nombre',
  carta_negociacion: 'N° Carta Negociación',
  fecha_venta: 'Fecha de venta',
  fecha_matricula: 'Fecha de matrícula',
  fecha_creacion: 'Fecha de registro',
  fecha_entrega: 'Fecha de entrega',
  revision_perdida: 'Revisión de pérdida',
  familiar_vinculado: 'Familiar vinculado',
  etiqueta: 'Etiqueta',
}

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtRelativo(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} sem.`
  return `Hace ${Math.floor(dias / 30)} mes${Math.floor(dias / 30) > 1 ? 'es' : ''}`
}

export default function VistaActividad({ leads, tenantId, etapaMap, onAbrirCliente }: Props) {
  const supabase = createClient()
  const [timelinePorCliente, setTimelinePorCliente] = useState<Record<string, TimelineItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')

  // Clientes en alcance: todo lo que viene de la pestaña (ya acotado por rol/filtros
  // arriba en VentasClient), menos los que están en una etapa marcada "perdido".
  const clientesEnAlcance = useMemo(
    () => leads.filter(l => !etapaMap[l.etapa_venta]?.es_perdido),
    [leads, etapaMap]
  )
  const idsEnAlcance = useMemo(() => clientesEnAlcance.map(l => l.id), [clientesEnAlcance])

  useEffect(() => {
    if (idsEnAlcance.length === 0) { setTimelinePorCliente({}); setLoading(false); return }
    let cancelado = false
    setLoading(true)

    async function cargar() {
      const [{ data: etapasHist }, { data: asignaciones }, { data: cambios }, { data: notasFicha }] = await Promise.all([
        supabase.from('historial_etapas_cliente')
          .select('id, cliente_id, etapa_anterior, etapa_nueva, created_at, usuarios(nombre)')
          .in('cliente_id', idsEnAlcance),
        supabase.from('historial_asignaciones')
          .select('id, cliente_id, created_at, usuario_anterior:usuario_anterior(nombre), usuario_nuevo:usuario_nuevo(nombre)')
          .in('cliente_id', idsEnAlcance),
        supabase.from('historial_cambios_cliente')
          .select('id, cliente_id, created_at, campo, valor_anterior, valor_nuevo, usuarios(nombre)')
          .in('cliente_id', idsEnAlcance),
        supabase.from('comentarios_cliente')
          .select('id, cliente_id, texto, created_at, usuarios(nombre)')
          .in('cliente_id', idsEnAlcance),
      ])
      if (cancelado) return

      const porCliente: Record<string, TimelineItem[]> = {}
      const push = (clienteId: string, item: TimelineItem) => {
        if (!porCliente[clienteId]) porCliente[clienteId] = []
        porCliente[clienteId].push(item)
      }
      const unoDeUsuarios = (u: unknown): { nombre: string } | null =>
        Array.isArray(u) ? (u[0] ?? null) : (u as { nombre: string } | null)

      for (const e of (etapasHist ?? []) as unknown as { id: string; cliente_id: string; etapa_anterior: string | null; etapa_nueva: string; created_at: string; usuarios: unknown }[]) {
        const prevLabel = e.etapa_anterior ? (etapaMap[e.etapa_anterior]?.label ?? e.etapa_anterior) : null
        const nuevaLabel = etapaMap[e.etapa_nueva]?.label ?? e.etapa_nueva
        push(e.cliente_id, {
          id: `etapa-${e.id}`, fecha: e.created_at, icono: '🔀', accent: 'border-l-blue-500',
          texto: prevLabel ? `Etapa: ${prevLabel} → ${nuevaLabel}` : `Etapa inicial: ${nuevaLabel}`,
          usuarioNombre: unoDeUsuarios(e.usuarios)?.nombre ?? null,
        })
      }
      for (const a of (asignaciones ?? []) as unknown as { id: string; cliente_id: string; created_at: string; usuario_anterior: unknown; usuario_nuevo: unknown }[]) {
        const ua = unoDeUsuarios(a.usuario_anterior)?.nombre
        const un = unoDeUsuarios(a.usuario_nuevo)?.nombre ?? 'sin asignar'
        push(a.cliente_id, {
          id: `asig-${a.id}`, fecha: a.created_at, icono: '🔁', accent: 'border-l-purple-500',
          texto: `Reasignado ${ua ? `de ${ua} ` : ''}a ${un}`,
          usuarioNombre: null,
        })
      }
      for (const c of (cambios ?? []) as unknown as { id: string; cliente_id: string; created_at: string; campo: string; valor_anterior: string | null; valor_nuevo: string; usuarios: unknown }[]) {
        const label = CAMPO_LABEL[c.campo] ?? c.campo
        push(c.cliente_id, {
          id: `cambio-${c.id}`, fecha: c.created_at,
          icono: c.campo === 'etiqueta' ? '🏷️' : '✏️',
          accent: c.campo === 'etiqueta' ? 'border-l-pink-500' : 'border-l-amber-500',
          texto: c.campo === 'etiqueta'
            ? `Etiqueta ${c.valor_nuevo}`
            : `${label}: ${c.valor_anterior ? `${c.valor_anterior} → ` : ''}${c.valor_nuevo}`,
          usuarioNombre: unoDeUsuarios(c.usuarios)?.nombre ?? null,
        })
      }
      for (const n of (notasFicha ?? []) as unknown as { id: string; cliente_id: string; texto: string; created_at: string; usuarios: unknown }[]) {
        push(n.cliente_id, {
          id: `nota-${n.id}`, fecha: n.created_at, icono: '💬', accent: 'border-l-teal-500',
          texto: n.texto, usuarioNombre: unoDeUsuarios(n.usuarios)?.nombre ?? null,
        })
      }

      for (const clienteId in porCliente) {
        porCliente[clienteId].sort((a, b) => b.fecha.localeCompare(a.fecha))
      }
      setTimelinePorCliente(porCliente)
      setLoading(false)
    }

    cargar()
    return () => { cancelado = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsEnAlcance.join(',')])

  // Solo clientes con al menos una acción registrada, ordenados por la más reciente.
  const tarjetas = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return clientesEnAlcance
      .map(l => ({ lead: l, timeline: timelinePorCliente[l.id] ?? [] }))
      .filter(t => t.timeline.length > 0)
      .filter(t => !q || (t.lead.cliente?.nombre ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.timeline[0].fecha.localeCompare(a.timeline[0].fecha))
  }, [clientesEnAlcance, timelinePorCliente, busqueda])

  function toggleExpandido(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Cargando actividad...</div>

  return (
    <div>
      <div className="mb-4">
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {tarjetas.length} cliente{tarjetas.length !== 1 ? 's' : ''} con actividad registrada — ordenados del cambio más reciente al más viejo.
        </p>
      </div>

      {tarjetas.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {busqueda.trim() ? 'Sin resultados para esa búsqueda.' : 'Sin actividad registrada todavía.'}
        </div>
      )}

      <div className="space-y-2">
        {tarjetas.map(({ lead, timeline }) => {
          const abierto = expandidos.has(lead.id)
          const ultimo = timeline[0]
          const etapaConfig = etapaMap[lead.etapa_venta]
          const visibles = abierto ? timeline : timeline.slice(0, 1)
          return (
            <div key={lead.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleExpandido(lead.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                  style={{ background: etapaConfig?.color ?? '#9CA3AF' }}>
                  {(lead.cliente?.nombre ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900 truncate">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                      style={{ background: etapaConfig?.color ?? '#9CA3AF' }}>
                      {etapaConfig?.label ?? lead.etapa_venta}
                    </span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {timeline.length} acción{timeline.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {ultimo.icono} {ultimo.texto}
                    {ultimo.usuarioNombre && <span className="text-gray-400"> · {ultimo.usuarioNombre}</span>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-600">{fmtRelativo(ultimo.fecha)}</p>
                  <p className="text-[10px] text-gray-400">{abierto ? 'Ocultar ▲' : 'Ver todo ▼'}</p>
                </div>
              </button>

              {abierto && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                  <button
                    onClick={() => onAbrirCliente(lead.id)}
                    className="text-xs text-blue-600 hover:underline font-medium mb-3"
                  >
                    Abrir ficha del cliente →
                  </button>
                  <div className="space-y-2">
                    {visibles.map(item => (
                      <div key={item.id} className={`bg-white border-l-4 ${item.accent} border-y border-r border-gray-100 rounded-lg px-3 py-2`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-gray-700 flex-1">
                            <span className="mr-1">{item.icono}</span>{item.texto}
                          </p>
                          <p className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">{fmtFechaHora(item.fecha)}</p>
                        </div>
                        {item.usuarioNombre && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{item.usuarioNombre}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
