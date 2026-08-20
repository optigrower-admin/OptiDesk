'use client'
import { useState, useRef } from 'react'
import { PDFDocument } from 'pdf-lib'

interface Props {
  tiposCatalogo: string[]
  onClose: () => void
  onUpload: (file: File, tipoDocumento: string | null) => Promise<void>
}

type Pagina = { dataUrl: string; w: number; h: number }
type Grupo = { id: string; color: string; tipoDocumento: string | null; paginas: Set<number> }

const COLORES = ['#2563eb', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f']

async function renderMiniaturas(file: File): Promise<Pagina[]> {
  // Import dinámico: pdfjs-dist es pesado y solo se necesita cuando se abre este modal.
  const pdfjsLib = await import('pdfjs-dist')
  // El worker se sirve desde CDN (no se empaqueta con webpack) porque el
  // build .mjs de pdfjs-dist usa import.meta a nivel de módulo, algo que el
  // bundler de Next 14 no procesa como asset estático sin configuración extra.
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const bytes = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise
  const paginas: Pagina[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 0.7 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    paginas.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.75), w: viewport.width, h: viewport.height })
  }
  return paginas
}

async function extraerPaginas(file: File, indices: number[], nombreBase: string): Promise<File> {
  const bytes = await file.arrayBuffer()
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const copiadas = await out.copyPages(src, indices)
  copiadas.forEach(p => out.addPage(p))
  const pdfBytes = await out.save()
  return new File([new Uint8Array(pdfBytes)], `${nombreBase}.pdf`, { type: 'application/pdf' })
}

export default function ExtraerPdfModal({ tiposCatalogo, onClose, onUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [cargandoPdf, setCargandoPdf] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoActivoId, setGrupoActivoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function elegirArchivo(f: File | null) {
    if (!f) return
    setError('')
    setArchivo(f)
    setCargandoPdf(true)
    try {
      const miniaturas = await renderMiniaturas(f)
      setPaginas(miniaturas)
    } catch {
      setError('No se pudo leer ese PDF. Verifica que no esté dañado o protegido con contraseña.')
      setArchivo(null)
    }
    setCargandoPdf(false)
  }

  function nuevoGrupo() {
    const id = crypto.randomUUID()
    const color = COLORES[grupos.length % COLORES.length]
    setGrupos(prev => [...prev, { id, color, tipoDocumento: tiposCatalogo[0] ?? null, paginas: new Set() }])
    setGrupoActivoId(id)
  }

  function quitarGrupo(id: string) {
    setGrupos(prev => prev.filter(g => g.id !== id))
    if (grupoActivoId === id) setGrupoActivoId(null)
  }

  function cambiarTipoGrupo(id: string, tipo: string) {
    setGrupos(prev => prev.map(g => g.id === id ? { ...g, tipoDocumento: tipo === '__otros__' ? null : tipo } : g))
  }

  function togglePagina(idx: number) {
    if (!grupoActivoId) return
    setGrupos(prev => prev.map(g => {
      if (g.id === grupoActivoId) {
        const next = new Set(g.paginas)
        next.has(idx) ? next.delete(idx) : next.add(idx)
        return { ...g, paginas: next }
      }
      // Una página solo puede pertenecer a un grupo — se quita de cualquier otro.
      if (g.paginas.has(idx)) {
        const next = new Set(g.paginas)
        next.delete(idx)
        return { ...g, paginas: next }
      }
      return g
    }))
  }

  function grupoDePagina(idx: number): Grupo | undefined {
    return grupos.find(g => g.paginas.has(idx))
  }

  const totalPaginasSeleccionadas = grupos.reduce((s, g) => s + g.paginas.size, 0)
  const puedeGuardar = archivo && grupos.some(g => g.paginas.size > 0) && !guardando

  async function guardar() {
    if (!archivo) return
    setGuardando(true)
    setError('')
    try {
      const gruposConPaginas = grupos.filter(g => g.paginas.size > 0)
      for (const g of gruposConPaginas) {
        const indices = [...g.paginas].sort((a, b) => a - b)
        const nombreBase = (g.tipoDocumento ?? 'documento').replace(/[<>:"/\\|?*]/g, '_')
        const file = await extraerPaginas(archivo, indices, nombreBase)
        await onUpload(file, g.tipoDocumento)
      }
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los documentos extraídos')
    }
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <p className="font-semibold text-gray-800 text-sm">✂️ Extraer Hojas PDF</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {!archivo && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 border-2 border-dashed border-gray-300 rounded-xl">
              <p className="text-sm text-gray-500 text-center max-w-sm">
                Sube un PDF con varias hojas (ej. carta + cédula + aduanas + nit) para elegir qué páginas van a cada documento.
              </p>
              <button onClick={() => fileRef.current?.click()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
                Seleccionar PDF
              </button>
            </div>
          )}

          {cargandoPdf && (
            <p className="text-sm text-gray-400 text-center py-8">Leyendo el PDF...</p>
          )}

          {archivo && !cargandoPdf && paginas.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{archivo.name} · {paginas.length} página{paginas.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setArchivo(null); setPaginas([]); setGrupos([]); setGrupoActivoId(null) }}
                  className="text-xs text-gray-400 hover:text-gray-600">Cambiar PDF</button>
              </div>

              {/* Grupos (documentos a generar) */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Documentos a extraer</p>
                {grupos.length === 0 && (
                  <p className="text-xs text-gray-400">Crea un grupo y marca las páginas que le corresponden.</p>
                )}
                {grupos.map(g => (
                  <div key={g.id}
                    onClick={() => setGrupoActivoId(g.id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                      grupoActivoId === g.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: g.color }} />
                    <select value={g.tipoDocumento ?? '__otros__'} onClick={e => e.stopPropagation()}
                      onChange={e => cambiarTipoGrupo(g.id, e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none min-w-0">
                      {tiposCatalogo.map(t => <option key={t} value={t}>{t}</option>)}
                      <option value="__otros__">Otros (sin categoría)</option>
                    </select>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {g.paginas.size === 0 ? 'sin páginas' : `pág. ${[...g.paginas].sort((a, b) => a - b).map(i => i + 1).join(', ')}`}
                    </span>
                    <button onClick={e => { e.stopPropagation(); quitarGrupo(g.id) }}
                      className="flex-shrink-0 text-red-400 hover:text-red-600 text-[11px]">Quitar</button>
                  </div>
                ))}
                <button onClick={nuevoGrupo}
                  className="text-xs font-semibold text-blue-600 hover:underline">+ Nuevo grupo / documento</button>
              </div>

              {/* Selector de páginas */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {grupoActivoId
                    ? 'Haz clic en las páginas que van en el grupo seleccionado'
                    : 'Selecciona o crea un grupo arriba para empezar a marcar páginas'}
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {paginas.map((p, idx) => {
                    const g = grupoDePagina(idx)
                    return (
                      <button key={idx} type="button" onClick={() => togglePagina(idx)}
                        disabled={!grupoActivoId}
                        className="relative rounded-lg overflow-hidden border-2 disabled:cursor-not-allowed transition-colors"
                        style={{ borderColor: g ? g.color : '#e5e7eb' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.dataUrl} alt={`Página ${idx + 1}`} className="w-full aspect-[3/4] object-cover bg-gray-50" />
                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{idx + 1}</span>
                        {g && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                            style={{ background: g.color }}>✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={e => { elegirArchivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </div>

        {archivo && paginas.length > 0 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex-shrink-0">
            <button onClick={guardar} disabled={!puedeGuardar}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-sm font-semibold">
              {guardando
                ? 'Guardando...'
                : `Guardar ${grupos.filter(g => g.paginas.size > 0).length || 0} documento${grupos.filter(g => g.paginas.size > 0).length === 1 ? '' : 's'} (${totalPaginasSeleccionadas} página${totalPaginasSeleccionadas === 1 ? '' : 's'})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
