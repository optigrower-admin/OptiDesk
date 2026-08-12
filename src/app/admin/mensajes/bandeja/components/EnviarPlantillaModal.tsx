'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type Plantilla = {
  id: string
  nombre: string
  cuerpo: string
  variables: string[]
  meta_status: string
  tipo_header: 'texto' | 'imagen' | 'documento' | 'video' | 'ninguno' | null
}

interface Props {
  onClose: () => void
  onEnviado: (conversacionId: string) => void
  // Si se abre desde una conversación ya existente con ventana cerrada, se
  // salta el paso de pedir teléfono/nombre y solo pide la plantilla.
  conversacionExistente?: { id: string; nombre: string }
}

function renderPreview(cuerpo: string, vars: Record<string, string>): string {
  return cuerpo.replace(/\{\{([^}]+)\}\}/g, (_, name) => vars[name.trim()] || `[${name.trim()}]`)
}

export default function EnviarPlantillaModal({ onClose, onEnviado, conversacionExistente }: Props) {
  const { profile } = useAuth()
  const supabase = createClient()

  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loadingPlantillas, setLoadingPlantillas] = useState(true)
  const [plantillaId, setPlantillaId] = useState('')
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [vars, setVars] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('plantillas_mensajes')
      .select('id, nombre, cuerpo, variables, meta_status, tipo_header')
      .eq('tenant_id', profile.tenant_id)
      .eq('meta_status', 'aprobada')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => {
        setPlantillas((data as Plantilla[]) ?? [])
        setLoadingPlantillas(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  const plantilla = plantillas.find(p => p.id === plantillaId) ?? null
  const usaMediaHeader = plantilla?.tipo_header === 'imagen' || plantilla?.tipo_header === 'video' || plantilla?.tipo_header === 'documento'

  useEffect(() => {
    setVars({})
    setError(null)
  }, [plantillaId])

  const preview = useMemo(() => plantilla ? renderPreview(plantilla.cuerpo, vars) : '', [plantilla, vars])

  const puedeEnviar = !!plantillaId && !usaMediaHeader
    && (conversacionExistente || telefono.trim().length >= 10)
    && (plantilla?.variables ?? []).every(v => vars[v]?.trim())

  async function enviar() {
    if (!puedeEnviar || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/mensajes/plantillas/enviar-directo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plantilla_id: plantillaId,
          variables: vars,
          ...(conversacionExistente
            ? { conversacion_id: conversacionExistente.id }
            : { telefono: telefono.trim(), nombre: nombre.trim() || undefined }),
        }),
      })
      const result = await r.json()
      if (!r.ok) { setError(result.error ?? 'No se pudo enviar la plantilla'); return }
      onEnviado(result.conversacion_id)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">
            {conversacionExistente ? `Usar plantilla — ${conversacionExistente.nombre}` : 'Nuevo mensaje por WhatsApp'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!conversacionExistente && (
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              WhatsApp solo permite iniciar conversación con un número que nunca te ha escrito usando una plantilla aprobada por Meta.
            </p>
          )}

          {!conversacionExistente && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de WhatsApp</label>
                <input value={telefono} onChange={e => setTelefono(e.target.value)}
                  placeholder="3001234567"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre (opcional)</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla</label>
            {loadingPlantillas ? (
              <p className="text-xs text-gray-400">Cargando plantillas...</p>
            ) : plantillas.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No tienes plantillas aprobadas por Meta todavía. Créalas y espera la aprobación en{' '}
                <a href="/admin/mensajes/plantillas" className="underline font-semibold">Mensajes → Plantillas</a>.
              </p>
            ) : (
              <select value={plantillaId} onChange={e => setPlantillaId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecciona una plantilla...</option>
                {plantillas.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
          </div>

          {usaMediaHeader && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Esta plantilla tiene una imagen/video/documento en el header — por ahora esos envíos directos no están soportados. Elige otra plantilla.
            </p>
          )}

          {plantilla && !usaMediaHeader && plantilla.variables.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Variables</label>
              {plantilla.variables.map(v => (
                <div key={v} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-24 flex-shrink-0">{'{{'}{v}{'}}'}</span>
                  <input value={vars[v] ?? ''} onChange={e => setVars(p => ({ ...p, [v]: e.target.value }))}
                    placeholder={v}
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          )}

          {plantilla && !usaMediaHeader && (
            <div className="bg-[#e5ddd5] rounded-xl px-4 py-3">
              <div className="max-w-[260px] ml-auto bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{preview}</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-3 justify-end px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={enviar} disabled={!puedeEnviar || enviando}
            className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-40 transition-colors">
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
