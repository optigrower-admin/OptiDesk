'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'

interface Medio {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  storage_location: 'r2' | 'drive'
  drive_url: string | null
}

export function MediaGallery({ medios, onDelete }: {
  medios: Medio[]
  onDelete?: (id: string) => void
}) {
  const [viewing, setViewing] = useState<Medio | null>(null)

  const getMediaUrl = (medio: Medio) => {
    if (medio.storage_location === 'drive') return medio.drive_url ?? '#'
    return `/api/media/${medio.id}`
  }

  const getDownloadUrl = (medio: Medio) => {
    if (medio.storage_location === 'drive') return medio.drive_url ?? '#'
    return `/api/media/${medio.id}?download=1`
  }

  if (!medios.length) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
        Sin fotos ni videos
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {medios.map((medio) => (
          <div key={medio.id} className="relative group aspect-square">
            {/* Click en miniatura → abre lightbox */}
            <button
              onClick={() => setViewing(medio)}
              className="w-full h-full bg-gray-100 rounded-lg overflow-hidden"
            >
              {medio.tipo === 'imagen' ? (
                <img
                  src={getMediaUrl(medio)}
                  alt={medio.nombre_archivo ?? 'Imagen'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/icons/icon-192.png'
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 gap-1">
                  <svg className="w-8 h-8 text-white opacity-80" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-white text-xs opacity-60">Video</span>
                </div>
              )}
            </button>

            {medio.storage_location === 'drive' && (
              <div className="absolute top-1 left-1">
                <Badge variant="purple">Drive</Badge>
              </div>
            )}

            {/* Botones acción (aparecen al hover) */}
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              {/* Descarga directa al dispositivo */}
              <a
                href={getDownloadUrl(medio)}
                download={medio.nombre_archivo ?? true}
                className="bg-white rounded-md p-1 shadow text-gray-600 hover:text-blue-700"
                title="Guardar en dispositivo"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(medio.id) }}
                  className="bg-white rounded-md p-1 shadow text-gray-600 hover:text-red-600"
                  title="Eliminar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setViewing(null)}
        >
          {/* Barra superior con acciones */}
          <div
            className="flex items-center justify-between w-full max-w-4xl mb-3 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-white/70 text-sm truncate max-w-xs">
              {viewing.nombre_archivo ?? ''}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={getDownloadUrl(viewing)}
                download={viewing.nombre_archivo ?? true}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                title="Guardar en dispositivo"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Guardar
              </a>
              <button
                onClick={() => setViewing(null)}
                className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-colors"
                title="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Contenido */}
          {viewing.tipo === 'imagen' ? (
            <img
              src={getMediaUrl(viewing)}
              alt={viewing.nombre_archivo ?? 'Imagen'}
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={getMediaUrl(viewing)}
              controls
              autoPlay
              className="max-w-full max-h-[85vh] rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  )
}
