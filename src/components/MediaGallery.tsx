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
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <svg className="w-8 h-8 text-white opacity-80" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
            </button>

            {medio.storage_location === 'drive' && (
              <div className="absolute top-1 left-1">
                <Badge variant="purple">Drive</Badge>
              </div>
            )}

            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <a
                href={getMediaUrl(medio)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-md p-1 shadow text-gray-600 hover:text-blue-700"
                title="Descargar"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
              {onDelete && (
                <button
                  onClick={() => onDelete(medio.id)}
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
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewing(null)}
        >
          {viewing.tipo === 'imagen' ? (
            <img
              src={getMediaUrl(viewing)}
              alt={viewing.nombre_archivo ?? 'Imagen'}
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={getMediaUrl(viewing)}
              controls
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  )
}
