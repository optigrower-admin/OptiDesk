'use client'

export interface UploadItemState {
  name: string
  tipo: 'imagen' | 'video'
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

export function UploadProgressModal({
  items,
  onClose,
}: {
  items: UploadItemState[]
  onClose?: () => void
}) {
  if (items.length === 0) return null

  const allDone = items.every((i) => i.status === 'done' || i.status === 'error')
  const exitosos = items.filter((i) => i.status === 'done')
  const fotos = exitosos.filter((i) => i.tipo === 'imagen').length
  const videos = exitosos.filter((i) => i.tipo === 'video').length
  const errores = items.filter((i) => i.status === 'error')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-4 space-y-3 max-h-[80vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900">{allDone ? 'Subida finalizada' : 'Subiendo archivos...'}</h3>
        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between gap-2 text-xs text-gray-600">
                <span className="truncate">{it.tipo === 'video' ? '🎥' : '🖼️'} {it.name}</span>
                <span className="flex-shrink-0">{it.status === 'error' ? 'Error' : `${it.progress}%`}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${it.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${it.status === 'done' ? 100 : it.progress}%` }}
                />
              </div>
              {it.status === 'error' && <p className="text-xs text-red-600">{it.error}</p>}
            </div>
          ))}
        </div>
        {allDone && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            {(fotos > 0 || videos > 0) && (
              <p className="text-sm text-gray-700">
                Se subieron exitosamente{fotos > 0 ? ` ${fotos} foto${fotos !== 1 ? 's' : ''}` : ''}
                {fotos > 0 && videos > 0 ? ' y' : ''}
                {videos > 0 ? ` ${videos} video${videos !== 1 ? 's' : ''}` : ''}.
              </p>
            )}
            {errores.length > 0 && (
              <p className="text-sm text-red-600">
                {errores.length} archivo{errores.length !== 1 ? 's' : ''} no se pudo subir.
              </p>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Cerrar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
