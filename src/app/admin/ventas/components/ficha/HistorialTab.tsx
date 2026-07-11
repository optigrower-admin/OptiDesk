'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'

interface Props {
  clienteId: string
}

type Usuario = { nombre: string; rol: string } | null
type Movimiento =
  | { tipo: 'etapa';    id: string; created_at: string; etapa_anterior: string | null; etapa_nueva: string; dias_en_etapa: number | null; usuarios: Usuario }
  | { tipo: 'asignacion'; id: string; created_at: string; usuario_anterior_nombre: string | null; usuario_nuevo_nombre: string | null }
  | { tipo: 'cambio';   id: string; created_at: string; campo: string; valor_anterior: string | null; valor_nuevo: string; usuario_nombre: string | null }

const ROL_LABEL: Record<string, string> = { admin: 'Admin', superadmin: 'SuperAdmin', mecanico: 'Mecánico', gerencia: 'Gerencia', control_total: 'Control total' }

const CAMPO_LABEL: Record<string, string> = {
  celular: 'Celular',
  placa: 'Placa',
  factura: 'N° Factura',
  etapa: 'Etapa',
  asignado_a: 'Asesor asignado',
  nombre: 'Nombre',
  numero_factura: 'N° Factura',
}

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function HistorialTab({ clienteId }: Props) {
  const supabase = createClient()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: etapas }, { data: asignaciones }] = await Promise.all([
      supabase.from('historial_etapas_cliente')
        .select('id,etapa_anterior,etapa_nueva,created_at,dias_en_etapa,usuarios(nombre,rol)')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('historial_asignaciones')
        .select('id,created_at,usuario_anterior:usuario_anterior(nombre),usuario_nuevo:usuario_nuevo(nombre)')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
    ])

    const etapasMov: Movimiento[] = (etapas ?? []).map(e => ({
      tipo: 'etapa', id: e.id, created_at: e.created_at, etapa_anterior: e.etapa_anterior,
      etapa_nueva: e.etapa_nueva, dias_en_etapa: e.dias_en_etapa,
      usuarios: Array.isArray(e.usuarios) ? e.usuarios[0] ?? null : e.usuarios,
    }))
    const asigMov: Movimiento[] = (asignaciones ?? []).map(a => {
      const ua = Array.isArray(a.usuario_anterior) ? a.usuario_anterior[0] : a.usuario_anterior
      const un = Array.isArray(a.usuario_nuevo) ? a.usuario_nuevo[0] : a.usuario_nuevo
      return {
        tipo: 'asignacion', id: a.id, created_at: a.created_at,
        usuario_anterior_nombre: (ua as { nombre: string } | null)?.nombre ?? null,
        usuario_nuevo_nombre: (un as { nombre: string } | null)?.nombre ?? null,
      }
    })

    // Campo libre — defensivo: tabla puede no existir aún
    let cambiosMov: Movimiento[] = []
    try {
      const { data: cambios } = await supabase
        .from('historial_cambios_cliente')
        .select('id, created_at, campo, valor_anterior, valor_nuevo, usuarios(nombre)')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
      cambiosMov = (cambios ?? []).map((c) => {
        const u = Array.isArray(c.usuarios) ? c.usuarios[0] : c.usuarios
        return {
          tipo: 'cambio' as const,
          id: c.id,
          created_at: c.created_at,
          campo: c.campo,
          valor_anterior: c.valor_anterior,
          valor_nuevo: c.valor_nuevo,
          usuario_nombre: (u as { nombre: string } | null)?.nombre ?? null,
        }
      })
    } catch { /* tabla aún no existe */ }

    setMovimientos([...etapasMov, ...asigMov, ...cambiosMov].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    setLoading(false)
  }, [clienteId, supabase])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>
  if (movimientos.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Sin historial aún. Los cambios de etapa, reasignaciones y ediciones aparecerán aquí.</p>

  return (
    <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
      {movimientos.map(m => {
        if (m.tipo === 'etapa') {
          const nuevaConf = ETAPA_MAP[m.etapa_nueva as EtapaVenta]
          const prevConf  = m.etapa_anterior ? ETAPA_MAP[m.etapa_anterior as EtapaVenta] : null
          return (
            <div key={`e-${m.id}`} className="relative">
              <div className="absolute -left-5 w-3 h-3 rounded-full border-2 border-white mt-0.5" style={{ background: nuevaConf?.color ?? '#888' }} />
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {prevConf && (
                    <>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: prevConf.color }}>{prevConf.label}</span>
                      <span className="text-gray-400 text-xs">→</span>
                    </>
                  )}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: nuevaConf?.color ?? '#888' }}>
                    {nuevaConf?.label ?? m.etapa_nueva}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{formatDateHour(m.created_at)}</p>
                {m.usuarios && <p className="text-xs text-gray-500">{m.usuarios.nombre} · {ROL_LABEL[m.usuarios.rol] ?? m.usuarios.rol}</p>}
                {m.dias_en_etapa !== null && m.dias_en_etapa > 0 && (
                  <p className="text-xs text-gray-400 italic">
                    {m.dias_en_etapa < 1 ? `${Math.round(m.dias_en_etapa * 24)}h en etapa anterior` : `${m.dias_en_etapa.toFixed(1)} días en etapa anterior`}
                  </p>
                )}
              </div>
            </div>
          )
        }

        if (m.tipo === 'asignacion') {
          return (
            <div key={`a-${m.id}`} className="relative">
              <div className="absolute -left-5 w-3 h-3 rounded-full border-2 border-white mt-0.5 bg-purple-500" />
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
                <p className="text-xs font-semibold text-purple-700">
                  🔁 Reasignado {m.usuario_anterior_nombre ? `de ${m.usuario_anterior_nombre} ` : ''}
                  a {m.usuario_nuevo_nombre ?? 'sin asignar'}
                </p>
                <p className="text-xs text-gray-400 mt-1">{formatDateHour(m.created_at)}</p>
              </div>
            </div>
          )
        }

        // tipo === 'cambio'
        const campoLabel = CAMPO_LABEL[m.campo] ?? m.campo
        return (
          <div key={`c-${m.id}`} className="relative">
            <div className="absolute -left-5 w-3 h-3 rounded-full border-2 border-white mt-0.5 bg-blue-400" />
            <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
              <p className="text-xs font-semibold text-blue-700">
                ✏️ {campoLabel} actualizado
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {m.valor_anterior && (
                  <>
                    <span className="text-xs text-gray-400 line-through">{m.valor_anterior}</span>
                    <span className="text-gray-300 text-xs">→</span>
                  </>
                )}
                <span className="text-xs font-semibold text-gray-700">{m.valor_nuevo}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{formatDateHour(m.created_at)}</p>
              {m.usuario_nombre && <p className="text-xs text-gray-500">{m.usuario_nombre}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
