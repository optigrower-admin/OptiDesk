'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
  size: string | null
  iconLink: string | null
  webViewLink: string | null
  thumbnailLink: string | null
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

const GOOGLE_NATIVE: Record<string, { label: string; color: string }> = {
  'application/vnd.google-apps.document':     { label: 'Doc',   color: '#4285F4' },
  'application/vnd.google-apps.spreadsheet':  { label: 'Sheet', color: '#0F9D58' },
  'application/vnd.google-apps.presentation': { label: 'Slide', color: '#F4B400' },
  'application/vnd.google-apps.form':         { label: 'Form',  color: '#9B59B6' },
}

function fileIcon(mime: string): string {
  if (mime === FOLDER_MIME) return '📁'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑'
  if (mime.includes('document') || mime.includes('word')) return '📝'
  if (mime.includes('video/')) return '🎬'
  if (mime.includes('audio/')) return '🎵'
  if (mime.includes('zip') || mime.includes('rar')) return '🗜️'
  return '📎'
}

function formatSize(bytes: string | null): string {
  if (!bytes) return ''
  const n = parseInt(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function canPreview(mime: string): boolean {
  if (mime === FOLDER_MIME) return false
  if (mime in GOOGLE_NATIVE) return true
  if (mime === 'application/pdf') return true
  if (mime.startsWith('image/')) return true
  return false
}

export default function DocumentosPage() {
  const { profile } = useAuth()

  const [files, setFiles]             = useState<DriveFile[]>([])
  const [cargando, setCargando]       = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [driveConectado, setDriveConectado] = useState(false)
  const [folderGuardado, setFolderGuardado] = useState<string | null>(null)
  const [folderInput, setFolderInput] = useState('')
  const [guardando, setGuardando]     = useState(false)
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [visorId, setVisorId]         = useState<DriveFile | null>(null)
  const [carpetaActual, setCarpetaActual] = useState<{ id: string; name: string }[]>([])

  const cargarConfig = useCallback(async () => {
    const res = await fetch('/api/admin/documentos/config')
    if (!res.ok) return
    const data = await res.json() as { folderId: string | null; driveConectado: boolean }
    setDriveConectado(data.driveConectado)
    setFolderGuardado(data.folderId)
    setFolderInput(data.folderId ?? '')
  }, [])

  const cargarArchivos = useCallback(async (subcarpetaId?: string) => {
    setCargando(true)
    setError(null)
    const url = subcarpetaId
      ? `/api/admin/documentos/listar?folder=${subcarpetaId}`
      : '/api/admin/documentos/listar'
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error al cargar' })) as { error?: string }
      setError(err.error ?? 'Error al cargar documentos')
    } else {
      const data = await res.json() as { files: DriveFile[] }
      setFiles(data.files ?? [])
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargarConfig().then(() => {})
  }, [cargarConfig])

  useEffect(() => {
    if (folderGuardado) cargarArchivos()
  }, [folderGuardado, cargarArchivos])

  async function guardarCarpeta() {
    setGuardando(true)
    const res = await fetch('/api/admin/documentos/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderRaw: folderInput }),
    })
    if (res.ok) {
      const data = await res.json() as { folderId: string | null }
      setFolderGuardado(data.folderId)
      setMostrarConfig(false)
      cargarArchivos()
    }
    setGuardando(false)
  }

  function abrirSubcarpeta(file: DriveFile) {
    setCarpetaActual(p => [...p, { id: file.id, name: file.name }])
    cargarArchivos(file.id)
  }

  function volverACarpeta(idx: number) {
    const nueva = carpetaActual.slice(0, idx)
    setCarpetaActual(nueva)
    if (nueva.length === 0) {
      cargarArchivos()
    } else {
      cargarArchivos(nueva[nueva.length - 1].id)
    }
  }

  if (!profile) return null

  const carpetas = files.filter(f => f.mimeType === FOLDER_MIME)
  const documentos = files.filter(f => f.mimeType !== FOLDER_MIME)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Panel principal */}
      <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${visorId ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Documentos Internos</h1>
            <p className="text-xs text-gray-500">Solo visible para gerencia y dueño</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => cargarArchivos(carpetaActual.at(-1)?.id)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Recargar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setMostrarConfig(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configurar carpeta
            </button>
          </div>
        </div>

        {/* Config panel */}
        {mostrarConfig && (
          <div className="flex-shrink-0 m-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-semibold text-blue-900 mb-1">Carpeta de Drive</p>
            {!driveConectado ? (
              <p className="text-sm text-red-600">
                Drive no está conectado. Ve a <strong>Config Serv. Téc.</strong> y conecta tu cuenta de Google primero.
              </p>
            ) : (
              <>
                <p className="text-xs text-blue-700 mb-2">
                  Pega el link de la carpeta de Drive donde tienes los documentos internos.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderInput}
                    onChange={e => setFolderInput(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... o solo el ID"
                    className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <button
                    onClick={guardarCarpeta}
                    disabled={guardando}
                    className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
                {folderGuardado && (
                  <p className="text-xs text-blue-600 mt-1.5">Carpeta actual: <code className="bg-white px-1 rounded">{folderGuardado}</code></p>
                )}
              </>
            )}
          </div>
        )}

        {/* Breadcrumb */}
        {carpetaActual.length > 0 && (
          <div className="flex-shrink-0 px-5 py-2 flex items-center gap-1 text-sm text-gray-500">
            <button onClick={() => volverACarpeta(0)} className="hover:text-blue-600 hover:underline">Inicio</button>
            {carpetaActual.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <span>/</span>
                <button
                  onClick={() => volverACarpeta(i + 1)}
                  className={i === carpetaActual.length - 1 ? 'text-gray-900 font-medium' : 'hover:text-blue-600 hover:underline'}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {!folderGuardado && !cargando && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <span className="text-5xl">📁</span>
              <p className="text-sm">Configura una carpeta de Drive para ver los documentos aquí.</p>
              <button onClick={() => setMostrarConfig(true)} className="text-sm text-blue-600 hover:underline">
                Abrir configuración
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          )}

          {cargando && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Cargando documentos...
            </div>
          )}

          {!cargando && !error && folderGuardado && files.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <span className="text-4xl">📂</span>
              <p className="text-sm">Esta carpeta está vacía.</p>
            </div>
          )}

          {!cargando && files.length > 0 && (
            <div className="space-y-6">
              {/* Carpetas */}
              {carpetas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Carpetas</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {carpetas.map(f => (
                      <button
                        key={f.id}
                        onClick={() => abrirSubcarpeta(f)}
                        className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group text-left"
                      >
                        <span className="text-3xl">📁</span>
                        <span className="text-xs text-gray-700 group-hover:text-blue-700 font-medium text-center line-clamp-2 leading-snug">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Archivos */}
              {documentos.length > 0 && (
                <div>
                  {carpetas.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Archivos</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {documentos.map(f => {
                      const native = GOOGLE_NATIVE[f.mimeType]
                      return (
                        <button
                          key={f.id}
                          onClick={() => canPreview(f.mimeType) ? setVisorId(f) : window.open(f.webViewLink ?? '#', '_blank')}
                          className="flex flex-col items-start gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group text-left"
                        >
                          {/* Thumbnail o icono */}
                          <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center relative">
                            {f.thumbnailLink ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={f.thumbnailLink.replace('=s220', '=s400')}
                                alt={f.name}
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <span className="text-4xl">{fileIcon(f.mimeType)}</span>
                            )}
                            {native && (
                              <span
                                className="absolute bottom-1 right-1 text-[10px] font-bold px-1 py-0.5 rounded text-white"
                                style={{ backgroundColor: native.color }}
                              >
                                {native.label}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 w-full">
                            <p className="text-xs font-medium text-gray-800 group-hover:text-blue-700 line-clamp-2 leading-snug">{f.name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {f.size && <span className="text-[10px] text-gray-400">{formatSize(f.size)}</span>}
                              {f.modifiedTime && <span className="text-[10px] text-gray-400">· {formatDate(f.modifiedTime)}</span>}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visor de documento */}
      {visorId && (
        <div className="flex flex-col border-l border-gray-200 bg-white" style={{ width: '60%', minWidth: 320 }}>
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{visorId.name}</p>
              <p className="text-xs text-gray-400">{formatDate(visorId.modifiedTime)}{visorId.size ? ` · ${formatSize(visorId.size)}` : ''}</p>
            </div>
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              <a
                href={visorId.webViewLink ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Abrir en Drive"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6M20 4L10 14" />
                </svg>
              </a>
              <button
                onClick={() => setVisorId(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <iframe
              src={`/api/admin/documentos/ver/${visorId.id}`}
              className="w-full h-full border-0"
              title={visorId.name}
            />
          </div>
        </div>
      )}
    </div>
  )
}
