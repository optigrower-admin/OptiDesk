'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface DocInterno {
  id: string
  nombre: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  categoria: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  anotaciones: string | null
  created_at: string
}

type VStatus = 'vencido' | 'proximo' | 'vigente' | 'ninguna'

function vStatus(fecha: string | null): VStatus {
  if (!fecha) return 'ninguna'
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const v = new Date(fecha + 'T00:00:00')
  const d = (v.getTime() - hoy.getTime()) / 86400000
  if (d < 0) return 'vencido'
  if (d <= 30) return 'proximo'
  return 'vigente'
}

const VCFG: Record<VStatus, { label: string; cls: string } | null> = {
  vencido: { label: 'Vencido',     cls: 'bg-red-100 text-red-700' },
  proximo: { label: 'Por vencer',  cls: 'bg-orange-100 text-orange-700' },
  vigente: { label: 'Vigente',     cls: 'bg-green-100 text-green-700' },
  ninguna: null,
}

function fIcon(mime: string | null) {
  if (!mime) return '📎'
  if (mime === 'application/pdf') return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑'
  if (mime.includes('document') || mime.includes('word')) return '📝'
  return '📎'
}

function fmtBytes(n: number | null) {
  if (!n) return ''
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const p = iso.split('T')[0].split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

function canPreview(mime: string | null) {
  return mime === 'application/pdf' || (mime?.startsWith('image/') ?? false)
}

export default function DocumentosPage() {
  const { profile } = useAuth()

  // List state
  const [docs, setDocs]           = useState<DocInterno[]>([])
  const [cargando, setCargando]   = useState(true)
  const [catActual, setCatActual] = useState('Todas')

  // Detail panel
  const [sel, setSel]             = useState<DocInterno | null>(null)
  const [eNombre, setENombre]     = useState('')
  const [eCat, setECat]           = useState('')
  const [eEmision, setEEmision]   = useState('')
  const [eVence, setEVence]       = useState('')
  const [eNota, setENota]         = useState('')
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  // Upload modal
  const [modalOpen, setModalOpen] = useState(false)
  const [uFile, setUFile]         = useState<File | null>(null)
  const [uNombre, setUNombre]     = useState('')
  const [uCat, setUCat]           = useState('')
  const [uNuevaCat, setUNuevaCat] = useState('')
  const [uEmision, setUEmision]   = useState('')
  const [uVence, setUVence]       = useState('')
  const [uNota, setUNota]         = useState('')
  const [subiendo, setSubiendo]   = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const [errSubida, setErrSubida] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const cargarDocs = useCallback(async () => {
    setCargando(true)
    const res = await fetch('/api/admin/documentos/listar')
    if (res.ok) {
      const data = await res.json() as { docs: DocInterno[] }
      setDocs(data.docs)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargarDocs() }, [cargarDocs])

  const categorias = ['Todas', ...[...new Set(docs.map(d => d.categoria))].sort()]
  const docsFiltrados = catActual === 'Todas' ? docs : docs.filter(d => d.categoria === catActual)

  function abrirDoc(doc: DocInterno) {
    setSel(doc)
    setENombre(doc.nombre)
    setECat(doc.categoria)
    setEEmision(doc.fecha_emision ?? '')
    setEVence(doc.fecha_vencimiento ?? '')
    setENota(doc.anotaciones ?? '')
  }

  async function guardar() {
    if (!sel) return
    setGuardando(true)
    const res = await fetch(`/api/admin/documentos/${sel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: eNombre,
        categoria: eCat,
        fecha_emision: eEmision || null,
        fecha_vencimiento: eVence || null,
        anotaciones: eNota || null,
      }),
    })
    if (res.ok) {
      const data = await res.json() as { doc: DocInterno }
      setDocs(prev => prev.map(d => d.id === data.doc.id ? data.doc : d))
      setSel(data.doc)
    }
    setGuardando(false)
  }

  async function eliminar() {
    if (!sel || !confirm(`¿Eliminar "${sel.nombre}"?\nEsta acción no se puede deshacer.`)) return
    setEliminando(true)
    const res = await fetch(`/api/admin/documentos/${sel.id}`, { method: 'DELETE' })
    if (res.ok) {
      setDocs(prev => prev.filter(d => d.id !== sel.id))
      setSel(null)
    }
    setEliminando(false)
  }

  function onFileSelect(f: File) {
    setUFile(f)
    setUNombre(f.name.replace(/\.[^.]+$/, ''))
    setErrSubida(null)
  }

  function resetModal() {
    setUFile(null); setUNombre(''); setUCat(''); setUNuevaCat('')
    setUEmision(''); setUVence(''); setUNota(''); setErrSubida(null)
  }

  async function subir() {
    if (!uFile) return
    setSubiendo(true)
    setErrSubida(null)

    const catFinal = uNuevaCat.trim() || (uCat !== '__nueva__' ? uCat : '') || 'General'

    try {
      // Paso 1: obtener signed URL y crear registro en BD
      const metaRes = await fetch('/api/admin/documentos/subir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:           uNombre.trim() || uFile.name,
          categoria:        catFinal,
          fecha_emision:    uEmision || null,
          fecha_vencimiento: uVence || null,
          anotaciones:      uNota.trim() || null,
          fileName:         uFile.name,
          mimeType:         uFile.type || 'application/octet-stream',
          fileSize:         uFile.size,
        }),
      })

      const metaData = await metaRes.json() as { ok?: boolean; doc?: DocInterno; uploadUrl?: string; error?: string }

      if (!metaRes.ok || !metaData.doc || !metaData.uploadUrl) {
        setErrSubida(metaData.error ?? 'Error al preparar la subida')
        setSubiendo(false)
        return
      }

      // Paso 2: subir archivo directamente a Supabase Storage
      const uploadRes = await fetch(metaData.uploadUrl, {
        method: 'PUT',
        body: uFile,
        headers: { 'Content-Type': uFile.type || 'application/octet-stream' },
      })

      if (!uploadRes.ok) {
        setErrSubida('Error al subir el archivo. Verifica que el bucket docs-internos existe en Supabase Storage.')
        setSubiendo(false)
        return
      }

      setDocs(prev => [metaData.doc!, ...prev])
      setModalOpen(false)
      resetModal()
    } catch (err) {
      setErrSubida('Error de conexión: ' + String(err))
    }

    setSubiendo(false)
  }

  if (!profile) return null

  const catsExistentes = [...new Set(docs.map(d => d.categoria))].sort()

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Panel principal ── */}
      <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${sel ? 'hidden lg:flex' : 'flex'}`}>

        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Documentos Internos</h1>
            <p className="text-xs text-gray-500">Solo visible para gerencia y dueño</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Subir documento
          </button>
        </div>

        {/* Tabs de categoría */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 py-2.5 border-b border-gray-100 bg-white overflow-x-auto scrollbar-hide">
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCatActual(cat)}
              className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                catActual === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'Todas'
                ? `Todas (${docs.length})`
                : `${cat} (${docs.filter(d => d.categoria === cat).length})`}
            </button>
          ))}
        </div>

        {/* Grid de documentos */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {cargando ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Cargando...
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <span className="text-5xl">📁</span>
              <p className="text-sm">
                {docs.length === 0
                  ? 'Aún no hay documentos. Sube el primero.'
                  : 'Sin documentos en esta carpeta.'}
              </p>
              {docs.length === 0 && (
                <button onClick={() => setModalOpen(true)} className="text-sm text-blue-600 hover:underline">
                  Subir documento
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {docsFiltrados.map(doc => {
                const vs   = vStatus(doc.fecha_vencimiento)
                const vcfg = VCFG[vs]
                return (
                  <button
                    key={doc.id}
                    onClick={() => abrirDoc(doc)}
                    className={`flex flex-col items-start p-3 bg-white border rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left group ${
                      sel?.id === doc.id ? 'border-blue-500 shadow-md' : 'border-gray-200'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between mb-2">
                      <span className="text-2xl">{fIcon(doc.mime_type)}</span>
                      {vcfg && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${vcfg.cls}`}>
                          {vcfg.label}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-700 line-clamp-2 leading-snug w-full mb-1.5">
                      {doc.nombre}
                    </p>

                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full mb-2">
                      {doc.categoria}
                    </span>

                    <div className="text-[10px] text-gray-400 space-y-0.5 w-full">
                      <div className="flex justify-between">
                        <span>Cargado</span>
                        <span>{fmtDate(doc.created_at)}</span>
                      </div>
                      {doc.fecha_emision && (
                        <div className="flex justify-between">
                          <span>Emisión</span>
                          <span>{fmtDate(doc.fecha_emision)}</span>
                        </div>
                      )}
                      {doc.fecha_vencimiento && (
                        <div className={`flex justify-between font-medium ${
                          vs === 'vencido' ? 'text-red-600' :
                          vs === 'proximo' ? 'text-orange-600' : 'text-green-600'
                        }`}>
                          <span>Vence</span>
                          <span>{fmtDate(doc.fecha_vencimiento)}</span>
                        </div>
                      )}
                      {doc.file_size ? <div className="text-right">{fmtBytes(doc.file_size)}</div> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel de detalle / edición ── */}
      {sel && (
        <div
          className="flex flex-col border-l border-gray-200 bg-white overflow-hidden flex-shrink-0"
          style={{ width: 400, minWidth: 300 }}
        >
          {/* Cabecera del panel */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900 truncate flex-1 mr-2">{sel.nombre}</p>
            <button
              onClick={() => setSel(null)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Visor inline (PDF e imágenes) */}
          {canPreview(sel.mime_type) && (
            <div className="flex-shrink-0 bg-gray-50 border-b border-gray-100" style={{ height: 280 }}>
              <iframe
                src={`/api/admin/documentos/ver/${sel.id}`}
                className="w-full h-full border-0"
                title={sel.nombre}
              />
            </div>
          )}

          {/* Formulario de edición */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
              <input
                type="text"
                value={eNombre}
                onChange={e => setENombre(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Carpeta / Categoría</label>
              <input
                type="text"
                value={eCat}
                onChange={e => setECat(e.target.value)}
                list="cats-panel"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="cats-panel">
                {catsExistentes.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Fecha emisión</label>
                <input
                  type="date"
                  value={eEmision}
                  onChange={e => setEEmision(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Fecha vencimiento</label>
                <input
                  type="date"
                  value={eVence}
                  onChange={e => setEVence(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Anotaciones</label>
              <textarea
                value={eNota}
                onChange={e => setENota(e.target.value)}
                rows={4}
                placeholder="Notas internas sobre este documento..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="text-[11px] text-gray-400 space-y-0.5 pt-1 border-t border-gray-100">
              <div className="flex justify-between">
                <span>Fecha de carga</span>
                <span>{fmtDate(sel.created_at)}</span>
              </div>
              {sel.file_size ? (
                <div className="flex justify-between">
                  <span>Tamaño</span>
                  <span>{fmtBytes(sel.file_size)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex items-center gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <a
              href={`/api/admin/documentos/ver/${sel.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Abrir / descargar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            <button
              onClick={eliminar}
              disabled={eliminando}
              className="p-2 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              title="Eliminar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de subida ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Subir documento</h2>
              <button
                onClick={() => { setModalOpen(false); resetModal() }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Zona de drop */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false)
                  const f = e.dataTransfer.files[0]
                  if (f) onFileSelect(f)
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  dragOver   ? 'border-blue-400 bg-blue-50' :
                  uFile      ? 'border-green-400 bg-green-50' :
                  'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f) }}
                />
                {uFile ? (
                  <div className="space-y-1">
                    <p className="text-3xl">{fIcon(uFile.type)}</p>
                    <p className="text-sm font-medium text-green-700 truncate">{uFile.name}</p>
                    <p className="text-xs text-gray-400">{fmtBytes(uFile.size)}</p>
                    <p className="text-xs text-blue-600 hover:underline">Cambiar archivo</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-3xl">📂</p>
                    <p className="text-sm font-medium text-gray-600">Arrastra un archivo o haz clic</p>
                    <p className="text-xs text-gray-400">PDF, Word, Excel, imágenes y más</p>
                  </div>
                )}
              </div>

              {/* Nombre */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del documento</label>
                <input
                  type="text"
                  value={uNombre}
                  onChange={e => setUNombre(e.target.value)}
                  placeholder="Ej: Contrato de arriendo local 2025"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Carpeta */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Carpeta / Categoría</label>
                <div className="flex gap-2">
                  <select
                    value={uCat}
                    onChange={e => { setUCat(e.target.value); if (e.target.value !== '__nueva__') setUNuevaCat('') }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">General</option>
                    {catsExistentes.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__nueva__">+ Nueva carpeta...</option>
                  </select>
                  {uCat === '__nueva__' && (
                    <input
                      type="text"
                      value={uNuevaCat}
                      onChange={e => setUNuevaCat(e.target.value)}
                      placeholder="Nombre de carpeta"
                      autoFocus
                      className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Fecha de emisión</label>
                  <input
                    type="date"
                    value={uEmision}
                    onChange={e => setUEmision(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={uVence}
                    onChange={e => setUVence(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Anotaciones */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Anotaciones</label>
                <textarea
                  value={uNota}
                  onChange={e => setUNota(e.target.value)}
                  rows={3}
                  placeholder="Notas internas sobre este documento..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {errSubida && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errSubida}
                </p>
              )}

              <button
                onClick={subir}
                disabled={!uFile || subiendo}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {subiendo ? 'Subiendo...' : 'Subir documento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
