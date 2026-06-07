'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MedioPerfil {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  created_at: string
}

interface NotaPerfil {
  id: string
  contenido: string
  created_at: string
  updated_at: string
  autor: { email: string; nombre: string } | null
}

interface Props {
  usuarioId: string
  tenantId: string
  currentUserId: string
  currentUserRol: string
  currentUserEmail: string
}

export function PerfilExtras({ usuarioId, tenantId, currentUserId, currentUserRol, currentUserEmail }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'media' | 'notas'>('media')

  // Media
  const [medios, setMedios] = useState<MedioPerfil[]>([])
  const [loadingMedia, setLoadingMedia] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [viewingMedio, setViewingMedio] = useState<MedioPerfil | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Notas
  const [notas, setNotas] = useState<NotaPerfil[]>([])
  const [loadingNotas, setLoadingNotas] = useState(true)
  const [nuevaNota, setNuevaNota] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [editingNota, setEditingNota] = useState<{ id: string; contenido: string } | null>(null)

  const cargarMedia = async () => {
    setLoadingMedia(true)
    const { data } = await supabase.from('medios_perfil')
      .select('id, url, tipo, nombre_archivo, created_at')
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
    setMedios((data as MedioPerfil[]) ?? [])
    setLoadingMedia(false)
  }

  const cargarNotas = async () => {
    setLoadingNotas(true)
    const { data } = await supabase.from('notas_perfil')
      .select('id, contenido, created_at, updated_at, autor:autor_id(email, nombre)')
      .eq('perfil_id', usuarioId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setNotas((data as unknown as NotaPerfil[]) ?? [])
    setLoadingNotas(false)
  }

  useEffect(() => {
    cargarMedia()
    cargarNotas()
  }, [usuarioId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const tipo: 'imagen' | 'video' = file.type.startsWith('video/') ? 'video' : 'imagen'
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tipo', tipo)
      fd.append('usuario_id', usuarioId)
      const res = await fetch('/api/upload-perfil', { method: 'POST', body: fd })
      if (res.ok) await cargarMedia()
      else {
        const err = await res.json()
        alert(err.error ?? 'Error al subir')
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteMedio = async (id: string) => {
    if (!confirm('¿Eliminar este archivo?')) return
    await fetch(`/api/media-perfil/${id}`, { method: 'DELETE' })
    setMedios((prev) => prev.filter((m) => m.id !== id))
    if (viewingMedio?.id === id) setViewingMedio(null)
  }

  const handleAddNota = async () => {
    if (!nuevaNota.trim()) return
    setSavingNota(true)
    await supabase.from('notas_perfil').insert({
      perfil_id: usuarioId,
      autor_id: currentUserId,
      tenant_id: tenantId,
      contenido: nuevaNota.trim(),
    })
    setNuevaNota('')
    await cargarNotas()
    setSavingNota(false)
  }

  const handleUpdateNota = async () => {
    if (!editingNota || !editingNota.contenido.trim()) return
    await supabase.from('notas_perfil').update({
      contenido: editingNota.contenido.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', editingNota.id)
    setEditingNota(null)
    await cargarNotas()
  }

  const handleDeleteNota = async (id: string) => {
    if (!confirm('¿Eliminar esta nota?')) return
    await supabase.from('notas_perfil').delete().eq('id', id)
    setNotas((prev) => prev.filter((n) => n.id !== id))
  }

  const puedeEliminarNota = (nota: NotaPerfil) => {
    return (nota.autor as { email: string } | null)?.email === currentUserEmail ||
      ['admin', 'gerencia', 'control_total'].includes(currentUserRol)
  }

  const formatFecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setTab('media')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'media' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Fotos y Videos
        </button>
        <button
          onClick={() => setTab('notas')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'notas' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Notas internas
        </button>
      </div>

      {/* Media Tab */}
      {tab === 'media' && (
        <div className="p-4 space-y-3">
          {/* Upload */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/mp4,video/quicktime"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Subiendo...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar foto/video
                </>
              )}
            </button>
            <span className="text-xs text-gray-400">Imágenes (20MB) o Videos (200MB)</span>
          </div>

          {loadingMedia ? (
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : medios.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
              Sin fotos ni videos — agrega el primero
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {medios.map((medio) => (
                <div key={medio.id} className="relative group aspect-square">
                  <button
                    onClick={() => setViewingMedio(medio)}
                    className="w-full h-full bg-gray-100 rounded-lg overflow-hidden"
                  >
                    {medio.tipo === 'imagen' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/media-perfil/${medio.id}`}
                        alt={medio.nombre_archivo ?? 'Foto'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200">
                        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs text-gray-500 mt-1">Video</span>
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteMedio(medio.id)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notas Tab */}
      {tab === 'notas' && (
        <div className="p-4 space-y-3">
          {/* Input nueva nota */}
          <div className="space-y-2">
            <textarea
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              placeholder="Escribe una nota interna..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={handleAddNota}
              disabled={savingNota || !nuevaNota.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {savingNota ? 'Guardando...' : '+ Agregar nota'}
            </button>
          </div>

          {/* Lista de notas */}
          {loadingNotas ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : notas.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">Sin notas todavía</p>
          ) : (
            <div className="space-y-2">
              {notas.map((nota) => (
                <div key={nota.id} className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                  {editingNota?.id === nota.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingNota.contenido}
                        onChange={(e) => setEditingNota({ ...editingNota, contenido: e.target.value })}
                        rows={2}
                        autoFocus
                        className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleUpdateNota} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold">Guardar</button>
                        <button onClick={() => setEditingNota(null)} className="px-3 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{nota.contenido}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                          <span className="font-medium text-gray-500">{nota.autor?.email ?? 'Desconocido'}</span>
                          {' · '}
                          {formatFecha(nota.created_at)}
                          {nota.updated_at !== nota.created_at && (
                            <span className="ml-1 italic">(editado)</span>
                          )}
                        </div>
                        {puedeEliminarNota(nota) && (
                          <div className="flex gap-1">
                            {nota.autor?.email === currentUserEmail && (
                              <button
                                onClick={() => setEditingNota({ id: nota.id, contenido: nota.contenido })}
                                className="text-gray-400 hover:text-blue-600 text-xs px-1.5 py-0.5 rounded hover:bg-blue-50"
                              >
                                Editar
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteNota(nota.id)}
                              className="text-gray-400 hover:text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {viewingMedio && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewingMedio(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-lg transition-colors"
            onClick={() => setViewingMedio(null)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {viewingMedio.tipo === 'imagen' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media-perfil/${viewingMedio.id}`}
              alt={viewingMedio.nombre_archivo ?? 'Foto'}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={`/api/media-perfil/${viewingMedio.id}`}
              controls
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  )
}
