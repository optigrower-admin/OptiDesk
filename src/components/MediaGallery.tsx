'use client'
import { useState, useRef } from 'react'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'

function ProcesandoThumb() {
  return (
    <div className="relative w-full h-full bg-gray-900 flex flex-col items-center justify-center gap-1.5 text-white/80">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-[10px]">Procesando...</span>
    </div>
  )
}

function VideoThumb({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div className="relative w-full h-full bg-gray-900">
      {!failed && (
        <video
          ref={videoRef}
          src={src}
          className={`w-full h-full object-cover transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = 0.001
          }}
          onSeeked={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {/* Icono play siempre visible encima del frame */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`rounded-full p-2.5 ${ready ? 'bg-black/40' : 'bg-black/60'}`}>
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ cantidad, onConfirm, onCancel }: { cantidad: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center mb-1">
          {cantidad > 1 ? `¿Eliminar ${cantidad} archivos?` : '¿Eliminar archivo?'}
        </h3>
        <p className="text-sm text-gray-500 text-center mb-6">Esta acción no se puede deshacer.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

interface Medio {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  storage_location: 'r2' | 'drive'
  drive_url: string | null
  procesando?: boolean
}

export function MediaGallery({ medios, onDelete, onDeleteMultiple, puedeSubirDrive, onMigrado }: {
  medios: Medio[]
  onDelete?: (id: string) => void
  /** Si se pasa, el borrado múltiple se hace con una sola llamada (recomendado
   *  para no disparar N confirmaciones/peticiones cuando el que llama a
   *  onDelete también muestra su propio diálogo nativo). Si no se pasa, se
   *  cae de vuelta a llamar onDelete una vez por cada archivo seleccionado. */
  onDeleteMultiple?: (ids: string[]) => void | Promise<void>
  /** Si es true, los archivos que no están en Drive muestran un botón "Cargar a Drive". */
  puedeSubirDrive?: boolean
  onMigrado?: (id: string, patch: Partial<Medio>) => void
}) {
  const [viewing, setViewing] = useState<Medio | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Medio | null>(null)
  const [migrando, setMigrando] = useState<Set<string>>(new Set())
  const [errorMigrar, setErrorMigrar] = useState<string | null>(null)
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [eliminandoBulk, setEliminandoBulk] = useState(false)

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function cancelarSeleccion() {
    setSeleccionando(false)
    setSeleccionados(new Set())
  }

  async function confirmarBorradoMultiple() {
    const ids = [...seleccionados]
    setEliminandoBulk(true)
    try {
      if (onDeleteMultiple) {
        await onDeleteMultiple(ids)
      } else {
        for (const id of ids) onDelete?.(id)
      }
    } finally {
      setEliminandoBulk(false)
      setConfirmBulkDelete(false)
      cancelarSeleccion()
    }
  }

  // Verifica el estado REAL en la base de datos en vez de confiar solo en la
  // respuesta del POST — el servidor puede tardar más que la conexión del
  // navegador (típico con videos grandes) y terminar la subida bien después
  // de que el fetch ya se cayó. Mientras no se confirme, el botón se queda
  // en "Cargando..." (nunca vuelve solo a mostrar la advertencia).
  const confirmarCargaDrive = async (medioId: string, intentos = 40): Promise<boolean> => {
    const supabase = createClient()
    for (let i = 0; i < intentos; i++) {
      await new Promise(res => setTimeout(res, 3000))
      const { data } = await supabase.from('medios').select('storage_location, drive_url, url').eq('id', medioId).maybeSingle()
      if (data?.storage_location === 'drive') {
        onMigrado?.(medioId, { storage_location: 'drive', drive_url: data.drive_url, url: data.url })
        return true
      }
    }
    return false
  }

  const cargarADrive = async (medio: Medio) => {
    setMigrando(prev => new Set(prev).add(medio.id))
    setErrorMigrar(null)
    let confirmado = false

    const verificacion = confirmarCargaDrive(medio.id).then(ok => { confirmado = ok; return ok })

    try {
      const r = await fetch('/api/admin/migrar-a-drive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ medio_id: medio.id }),
      })
      const result = await r.json().catch(() => null)
      if (result?.procesados === 1) {
        confirmado = true
        onMigrado?.(medio.id, { storage_location: 'drive' })
      } else if (!confirmado && (result?.errores?.length || (result && !r.ok))) {
        // Error explícito del servidor (no un simple timeout de conexión) —
        // no tiene sentido seguir esperando, se avisa de una vez.
        const msg = result.errores?.[0]?.error ?? result.error ?? 'No se pudo cargar a Drive'
        setErrorMigrar(msg); alert(`No se pudo cargar a Drive: ${msg}`)
        setMigrando(prev => { const next = new Set(prev); next.delete(medio.id); return next })
        return
      }
      // Si no hay `result` (timeout/desconexión) dejamos que la verificación
      // en segundo plano confirme cuando el servidor termine.
    } catch {
      // El fetch se cayó (probable timeout) — se sigue esperando la
      // confirmación real contra la base de datos, no se asume que falló.
    }

    const ok = await verificacion
    setMigrando(prev => { const next = new Set(prev); next.delete(medio.id); return next })
    if (!ok && !confirmado) {
      const msg = 'No se pudo confirmar la carga a Drive después de esperar varios minutos. Puede seguir procesándose en segundo plano — revisa de nuevo en un rato o vuelve a intentar.'
      setErrorMigrar(msg); alert(msg)
    }
  }

  // Para Drive, `medio.url` guarda el File ID de Google.
  // Las imágenes usan el CDN directo de Google (funciona como <img src>).
  // Los videos usan el player embebible de Drive (solo sirve en <iframe>).
  const getMediaUrl = (medio: Medio) => {
    if (medio.storage_location === 'drive') {
      if (medio.tipo === 'imagen') return `https://lh3.googleusercontent.com/d/${medio.url}`
      return `https://drive.google.com/file/d/${medio.url}/preview`
    }
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
      {errorMigrar && (
        <p className="text-xs text-red-600 mb-2">⚠ {errorMigrar}</p>
      )}

      {onDelete && (
        <div className="flex items-center justify-between mb-2 min-h-[28px]">
          {seleccionando ? (
            <>
              <span className="text-xs font-semibold text-gray-600">
                {seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={seleccionados.size === 0}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 transition-colors"
                >
                  🗑 Eliminar
                </button>
                <button onClick={cancelarSeleccion} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setSeleccionando(true)}
              className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1"
            >
              Seleccionar
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {medios.map((medio) => (
          <div key={medio.id} className="relative group aspect-square">
            {/* Click en miniatura → abre lightbox (o marca selección si está en modo seleccionar) */}
            <button
              onClick={() => seleccionando ? toggleSeleccion(medio.id) : setViewing(medio)}
              className="w-full h-full bg-gray-100 rounded-lg overflow-hidden"
              disabled={medio.procesando}
            >
              {medio.procesando ? (
                <ProcesandoThumb />
              ) : medio.tipo === 'imagen' ? (
                <img
                  src={getMediaUrl(medio)}
                  alt={medio.nombre_archivo ?? 'Imagen'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/icons/icon-192.png'
                  }}
                />
              ) : medio.storage_location === 'drive' ? (
                // Los videos de Drive no se pueden mostrar como <video src>
                // porque Drive no sirve el stream con los headers CORS correctos.
                // Mostramos un placeholder con icono de play.
                <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
                  <div className="rounded-full p-2.5 bg-black/60">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              ) : (
                <VideoThumb src={getMediaUrl(medio)} />
              )}
            </button>

            {seleccionando && (
              <div
                onClick={() => toggleSeleccion(medio.id)}
                className={`absolute top-1 left-1 w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-colors ${
                  seleccionados.has(medio.id) ? 'bg-blue-600 border-blue-600' : 'bg-white/80 border-gray-300'
                }`}
              >
                {seleccionados.has(medio.id) && (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            )}

            {!seleccionando && (medio.storage_location === 'drive' ? (
              <div className="absolute top-1 left-1">
                <Badge variant="purple">Drive</Badge>
              </div>
            ) : puedeSubirDrive && !medio.procesando ? (
              <div className="absolute top-1 left-1">
                <button
                  onClick={(e) => { e.stopPropagation(); cargarADrive(medio) }}
                  disabled={migrando.has(medio.id)}
                  className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 text-[10px] font-semibold hover:bg-amber-200 transition-colors disabled:opacity-60"
                  title="Este archivo todavía no está respaldado en Google Drive"
                >
                  {migrando.has(medio.id) ? (
                    <>
                      <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Cargando...
                    </>
                  ) : '⚠ Cargar a Drive'}
                </button>
              </div>
            ) : null)}

            {/* Botones acción (aparecen al hover) */}
            {!seleccionando && (
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
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(medio) }}
                  className="bg-white rounded-md p-1 shadow text-gray-600 hover:text-red-600"
                  title="Eliminar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal confirmar eliminación (una sola) */}
      {confirmDelete && onDelete && (
        <ConfirmDeleteModal
          cantidad={1}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Modal confirmar eliminación múltiple */}
      {confirmBulkDelete && (
        <ConfirmDeleteModal
          cantidad={seleccionados.size}
          onConfirm={confirmarBorradoMultiple}
          onCancel={() => !eliminandoBulk && setConfirmBulkDelete(false)}
        />
      )}

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
          ) : viewing.storage_location === 'drive' ? (
            // Videos de Drive: usar el player embebible de Google
            <iframe
              src={getMediaUrl(viewing)}
              className="w-full max-w-3xl rounded-lg"
              style={{ height: '60vh' }}
              allow="autoplay"
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
