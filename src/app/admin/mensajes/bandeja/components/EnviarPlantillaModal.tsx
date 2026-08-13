'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type Plantilla = {
  id: string
  nombre: string
  cuerpo: string
  variables: string[]
  meta_status: string
  tipo_header: 'texto' | 'imagen' | 'documento' | 'video' | 'ninguno' | null
  header_texto: string | null
  footer_texto: string | null
}

interface Props {
  onClose: () => void
  onEnviado: (conversacionId: string) => void
  // Si se abre desde una conversación ya existente con ventana cerrada, se
  // salta el paso de pedir teléfono/nombre y solo pide la plantilla.
  conversacionExistente?: { id: string; nombre: string }
}

const ACCEPT_POR_TIPO: Record<string, string> = {
  imagen: 'image/*',
  video: 'video/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
}

function renderPreview(cuerpo: string, vars: Record<string, string>): string {
  return cuerpo.replace(/\{\{([^}]+)\}\}/g, (_, name) => vars[name.trim()] || `[${name.trim()}]`)
}

export default function EnviarPlantillaModal({ onClose, onEnviado, conversacionExistente }: Props) {
  const { profile } = useAuth()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loadingPlantillas, setLoadingPlantillas] = useState(true)
  const [plantillaId, setPlantillaId] = useState('')
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [vars, setVars] = useState<Record<string, string>>({})
  const [headerFile, setHeaderFile] = useState<File | null>(null)
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('plantillas_mensajes')
      .select('id, nombre, cuerpo, variables, meta_status, tipo_header, header_texto, footer_texto')
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
    setHeaderFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [plantillaId])

  // Preview local del archivo (solo imágenes/video, para que se vea algo antes de enviar)
  useEffect(() => {
    if (!headerFile) { setHeaderPreviewUrl(null); return }
    const url = URL.createObjectURL(headerFile)
    setHeaderPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [headerFile])

  const preview = useMemo(() => plantilla ? renderPreview(plantilla.cuerpo, vars) : '', [plantilla, vars])

  const puedeEnviar = !!plantillaId
    && (!usaMediaHeader || !!headerFile)
    && (conversacionExistente || telefono.trim().length >= 10)
    && (plantilla?.variables ?? []).every(v => vars[v]?.trim())

  async function enviar() {
    if (!puedeEnviar || enviando || !plantilla) return
    setEnviando(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('plantilla_id', plantillaId)
      fd.append('variables', JSON.stringify(vars))
      if (conversacionExistente) {
        fd.append('conversacion_id', conversacionExistente.id)
      } else {
        fd.append('telefono', telefono.trim())
        if (nombre.trim()) fd.append('nombre', nombre.trim())
      }
      if (headerFile) fd.append('header_media', headerFile)

      const r = await fetch('/api/admin/mensajes/plantillas/enviar-directo', { method: 'POST', body: fd })
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

          {usaMediaHeader && plantilla && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Archivo del header ({plantilla.tipo_header}) — obligatorio
              </label>
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                  📎 {headerFile ? 'Cambiar archivo' : 'Elegir archivo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ACCEPT_POR_TIPO[plantilla.tipo_header ?? '']}
                    onChange={e => setHeaderFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {headerFile && (
                  <span className="text-xs text-gray-500 truncate max-w-[180px]">{headerFile.name}</span>
                )}
              </div>
              {headerPreviewUrl && plantilla.tipo_header === 'imagen' && (
                <img src={headerPreviewUrl} alt="" className="mt-2 max-h-32 rounded-lg border border-gray-100" />
              )}
              {headerPreviewUrl && plantilla.tipo_header === 'video' && (
                <video src={headerPreviewUrl} controls className="mt-2 max-h-32 rounded-lg border border-gray-100" />
              )}
              <p className="text-xs text-gray-400 mt-1">Máximo 4 MB.</p>
            </div>
          )}

          {plantilla && plantilla.variables.length > 0 && (
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

          {plantilla && (
            <div className="bg-[#e5ddd5] rounded-xl px-4 py-3">
              <div className="max-w-[260px] ml-auto bg-white rounded-xl overflow-hidden shadow-sm">
                {plantilla.tipo_header === 'texto' && plantilla.header_texto && (
                  <p className="font-bold text-gray-900 text-sm px-3 pt-2.5">{plantilla.header_texto}</p>
                )}
                {headerPreviewUrl && plantilla.tipo_header === 'imagen' && (
                  <img src={headerPreviewUrl} alt="" className="w-full max-h-40 object-cover" />
                )}
                {headerPreviewUrl && plantilla.tipo_header === 'video' && (
                  <video src={headerPreviewUrl} className="w-full max-h-40 object-cover" />
                )}
                {usaMediaHeader && plantilla.tipo_header === 'documento' && headerFile && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span>📄</span>
                    <span className="text-xs text-gray-600 truncate">{headerFile.name}</span>
                  </div>
                )}
                <div className="px-3 py-2.5">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{preview}</p>
                  {plantilla.footer_texto && (
                    <p className="text-xs text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100">{plantilla.footer_texto}</p>
                  )}
                </div>
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
