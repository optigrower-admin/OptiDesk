'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type CampoRegla =
  | 'celular' | 'placa' | 'alistamiento' | 'numero_factura'
  | 'numero_carta_negociacion' | 'fecha_entrega' | 'aprobacion_gerencia'

export interface ReglaEtapa {
  id: string
  etapa_id: string
  campo: CampoRegla
  etiqueta: string
  mensaje_ayuda: string | null
  color: string
  bloquea_cambio_etapa: boolean
  activa: boolean
  orden: number
}

export interface EtapaDinamica {
  id: string // clave — mismo valor que antes era el string literal EtapaVenta
  label: string
  color: string
  bg: string
  border: string
  orden: number
  grupoId: string
  grupoLabel: string
  grupoColor: string
  pipelineId: string
  pipelineNombre: string
  pipelineClave: string
  es_activa: boolean
  es_lead: boolean
  es_etapa_inicial: boolean
  es_ganado: boolean
  es_perdido: boolean
  requiere_celular: boolean
  requiere_placa: boolean
  requiere_fecha_entrega: boolean
  requiere_carta_negociacion: boolean
  requiere_factura: boolean
  requiere_aprobacion_gerencia: boolean
  reglas: ReglaEtapa[]
  rolesBloqueados: string[] // roles que ya no pueden editar/mover clientes en esta etapa
}

export interface GrupoDinamico {
  grupoId: string
  grupoLabel: string
  color: string
  bg: string
  etapas: EtapaDinamica[]
}

export interface PipelineDinamico {
  id: string
  clave: string
  nombre: string
  orden: number
  grupos: GrupoDinamico[]
}

interface RowPipeline { id: string; clave: string; nombre: string; orden: number }
interface RowGrupo { id: string; pipeline_id: string; clave: string; nombre: string; color: string; orden: number }
interface RowEtapa {
  id: string; pipeline_id: string; grupo_id: string | null; clave: string; label: string
  color: string; bg: string; border: string; orden: number
  es_activa: boolean; es_lead: boolean; es_etapa_inicial: boolean; es_ganado: boolean; es_perdido: boolean
  requiere_celular: boolean; requiere_placa: boolean; requiere_fecha_entrega: boolean
  requiere_carta_negociacion: boolean; requiere_factura: boolean; requiere_aprobacion_gerencia: boolean
}

export function useEtapasPipeline(tenantId: string | undefined) {
  const [etapas, setEtapas] = useState<EtapaDinamica[]>([])
  const [pipelines, setPipelines] = useState<PipelineDinamico[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!tenantId) return
    const supabase = createClient()
    let cancelado = false

    async function cargar() {
      const [{ data: pv }, { data: pg }, { data: ep }, { data: rg }, { data: br }] = await Promise.all([
        supabase.from('pipelines_venta').select('id, clave, nombre, orden').eq('tenant_id', tenantId).order('orden'),
        supabase.from('pipeline_grupos').select('id, pipeline_id, clave, nombre, color, orden').eq('tenant_id', tenantId).order('orden'),
        supabase.from('etapas_pipeline').select('*').eq('tenant_id', tenantId).order('orden'),
        supabase.from('reglas_etapa').select('*').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
        supabase.from('etapas_bloqueo_rol').select('etapa_id, rol').eq('tenant_id', tenantId),
      ])
      if (cancelado) return

      const pipelinesRaw = (pv as RowPipeline[]) ?? []
      const gruposRaw = (pg as RowGrupo[]) ?? []
      const etapasRaw = (ep as RowEtapa[]) ?? []
      const reglasRaw = (rg as ReglaEtapa[]) ?? []
      const bloqueosRaw = (br as { etapa_id: string; rol: string }[]) ?? []

      const gruposMap = new Map(gruposRaw.map(g => [g.id, g]))
      const pipelinesMap = new Map(pipelinesRaw.map(p => [p.id, p]))

      const etapasOut: EtapaDinamica[] = etapasRaw.map(e => {
        const g = e.grupo_id ? gruposMap.get(e.grupo_id) : undefined
        const p = pipelinesMap.get(e.pipeline_id)
        return {
          id: e.clave, label: e.label, color: e.color, bg: e.bg, border: e.border, orden: e.orden,
          grupoId: g?.id ?? '', grupoLabel: g?.nombre ?? '', grupoColor: g?.color ?? '#6b7280',
          pipelineId: p?.id ?? e.pipeline_id, pipelineNombre: p?.nombre ?? '', pipelineClave: p?.clave ?? '',
          es_activa: e.es_activa, es_lead: e.es_lead, es_etapa_inicial: e.es_etapa_inicial,
          es_ganado: e.es_ganado, es_perdido: e.es_perdido,
          requiere_celular: e.requiere_celular, requiere_placa: e.requiere_placa,
          requiere_fecha_entrega: e.requiere_fecha_entrega,
          requiere_carta_negociacion: e.requiere_carta_negociacion,
          requiere_factura: e.requiere_factura, requiere_aprobacion_gerencia: e.requiere_aprobacion_gerencia,
          reglas: reglasRaw.filter(r => r.etapa_id === e.id).sort((a, b) => a.orden - b.orden),
          rolesBloqueados: bloqueosRaw.filter(b => b.etapa_id === e.id).map(b => b.rol),
        }
      })

      const pipelinesOut: PipelineDinamico[] = pipelinesRaw.map(p => ({
        id: p.id, clave: p.clave, nombre: p.nombre, orden: p.orden,
        grupos: gruposRaw
          .filter(g => g.pipeline_id === p.id)
          .map(g => ({
            grupoId: g.id, grupoLabel: g.nombre, color: g.color, bg: `${g.color}15`,
            etapas: etapasOut.filter(e => e.grupoId === g.id).sort((a, b) => a.orden - b.orden),
          })),
      }))

      setEtapas(etapasOut)
      setPipelines(pipelinesOut)
      setLoading(false)
    }

    cargar()
    return () => { cancelado = true }
  }, [tenantId, version])

  const etapaMap: Record<string, EtapaDinamica> = Object.fromEntries(etapas.map(e => [e.id, e]))
  const etapaOrden: Record<string, number> = Object.fromEntries(etapas.map(e => [e.id, e.orden]))
  const recargar = () => setVersion(v => v + 1)

  return { etapas, pipelines, etapaMap, etapaOrden, loading, recargar }
}
