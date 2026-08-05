'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
}

type Archivo = {
  id: string
  tipo: string
  nombre_archivo: string | null
  created_at: string
  storage_location: string
  drive_url: string | null
  tipo_documento: string | null
}

const ICONO: Record<string, string> = { pdf: '📄', imagen: '🖼️', excel: '📊', word: '📝', otro: '📎' }

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── PDF encoder: wraps one or more JPEG blobs into a multi-page PDF ────────────
async function jpegsToPdf(pages: { blob: Blob; w: number; h: number }[]): Promise<Blob> {
  const e = new TextEncoder()
  const n = pages.length
  const jpgs = await Promise.all(pages.map(p => p.blob.arrayBuffer().then(b => new Uint8Array(b))))

  const kids = Array.from({ length: n }, (_, i) => `${3 + i * 3} 0 R`).join(' ')
  const objBytes: Uint8Array[] = [
    e.encode(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`),
    e.encode(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`),
  ]

  for (let i = 0; i < n; i++) {
    const { w, h } = pages[i]
    const pageObjNum = 3 + i * 3, contObjNum = 4 + i * 3, imgObjNum = 5 + i * 3
    const pageW = 595
    const pageH = Math.min(842, Math.round(595 * h / w))
    const streamStr = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im${i} Do Q\n`
    objBytes.push(e.encode(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contObjNum} 0 R /Resources << /XObject << /Im${i} ${imgObjNum} 0 R >> >> >>\nendobj\n`))
    objBytes.push(e.encode(`${contObjNum} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}endstream\nendobj\n`))
    const hdrImg = e.encode(`${imgObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgs[i].length} >>\nstream\n`)
    const ftrImg = e.encode(`\nendstream\nendobj\n`)
    const imgObj = new Uint8Array(hdrImg.length + jpgs[i].length + ftrImg.length)
    imgObj.set(hdrImg, 0); imgObj.set(jpgs[i], hdrImg.length); imgObj.set(ftrImg, hdrImg.length + jpgs[i].length)
    objBytes.push(imgObj)
  }

  const hdr = e.encode('%PDF-1.4\n')
  let pos = hdr.length
  const offs: number[] = []
  for (const b of objBytes) { offs.push(pos); pos += b.length }
  const xrefPos = pos
  const totalObjs = objBytes.length + 1
  const xr = e.encode(['xref\n', `0 ${totalObjs}\n`, '0000000000 65535 f \n', ...offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`)].join(''))
  const tr = e.encode(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`)
  const parts = [hdr, ...objBytes, xr, tr]
  const buf = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let off = 0
  for (const p of parts) { buf.set(p, off); off += p.length }
  return new Blob([buf], { type: 'application/pdf' })
}

// ── Gaussian elimination (8×8) to solve for homography coefficients ───────────
function solveH(
  dstPts: [number, number][],
  srcPts: [number, number][]
): Float64Array {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = dstPts[i]
    const [sx, sy] = srcPts[i]
    A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx, sx])
    A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy, sy])
  }
  for (let col = 0; col < 8; col++) {
    let maxRow = col
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row
    }
    ;[A[col], A[maxRow]] = [A[maxRow], A[col]]
    const pivot = A[col][col]
    if (Math.abs(pivot) < 1e-10) throw new Error('Singular')
    for (let row = col + 1; row < 8; row++) {
      const f = A[row][col] / pivot
      for (let k = col; k <= 8; k++) A[row][k] -= f * A[col][k]
    }
  }
  const x = new Float64Array(8)
  for (let i = 7; i >= 0; i--) {
    x[i] = A[i][8]
    for (let j = i + 1; j < 8; j++) x[i] -= A[i][j] * x[j]
    x[i] /= A[i][i]
  }
  return x
}

// ── Perspective warp: extracts the quadrilateral defined by corners ───────────
function warpPerspective(
  src: HTMLCanvasElement,
  corners: { x: number; y: number }[]  // tl, tr, br, bl in source coords
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners
  const outW = Math.round(Math.max(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(br.x - bl.x, br.y - bl.y)
  ))
  const outH = Math.round(Math.max(
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
    Math.hypot(br.x - tr.x, br.y - tr.y)
  ))

  // Inverse mapping: output pixel → source pixel
  const dstPts: [number, number][] = [[0, 0], [outW, 0], [outW, outH], [0, outH]]
  const srcPts: [number, number][] = [
    [tl.x, tl.y], [tr.x, tr.y], [br.x, br.y], [bl.x, bl.y],
  ]
  const h = solveH(dstPts, srcPts)

  const out = document.createElement('canvas')
  out.width = outW; out.height = outH
  const ctx = out.getContext('2d')!
  const srcCtx = src.getContext('2d')!
  const srcData = srcCtx.getImageData(0, 0, src.width, src.height)
  const outData = ctx.createImageData(outW, outH)
  const sd = srcData.data, od = outData.data
  const W = src.width, H = src.height

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const denom = h[6] * ox + h[7] * oy + 1
      const sx = (h[0] * ox + h[1] * oy + h[2]) / denom
      const sy = (h[3] * ox + h[4] * oy + h[5]) / denom
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const x1 = x0 + 1, y1 = y0 + 1
      if (x0 < 0 || y0 < 0 || x1 >= W || y1 >= H) continue
      const fx = sx - x0, fy = sy - y0
      const oi = (oy * outW + ox) * 4
      for (let c = 0; c < 3; c++) {
        const s00 = sd[(y0 * W + x0) * 4 + c]
        const s10 = sd[(y0 * W + x1) * 4 + c]
        const s01 = sd[(y1 * W + x0) * 4 + c]
        const s11 = sd[(y1 * W + x1) * 4 + c]
        od[oi + c] = Math.round(s00 * (1 - fx) * (1 - fy) + s10 * fx * (1 - fy) + s01 * (1 - fx) * fy + s11 * fx * fy)
      }
      od[oi + 3] = 255
    }
  }
  ctx.putImageData(outData, 0, 0)
  return out
}

// ── Document edge auto-detection ─────────────────────────────────────────────
function detectDocumentCorners(
  canvas: HTMLCanvasElement
): { x: number; y: number }[] {
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, W, H)

  const rowAvg = new Float32Array(H)
  const colAvg = new Float32Array(W)
  for (let y = 0; y < H; y++) {
    let sum = 0
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    rowAvg[y] = sum / W
  }
  for (let x = 0; x < W; x++) {
    let sum = 0
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    colAvg[x] = sum / H
  }

  const threshold = 175
  let top = 0, bottom = H - 1, left = 0, right = W - 1
  while (top < H - 1 && rowAvg[top] < threshold) top++
  while (bottom > 0 && rowAvg[bottom] < threshold) bottom--
  while (left < W - 1 && colAvg[left] < threshold) left++
  while (right > 0 && colAvg[right] < threshold) right--

  // Expand slightly + validate
  const mx = W * 0.015, my = H * 0.015
  top    = Math.max(0, top - my)
  bottom = Math.min(H - 1, bottom + my)
  left   = Math.max(0, left - mx)
  right  = Math.min(W - 1, right + mx)

  const goodDetection = right - left > W * 0.2 && bottom - top > H * 0.2
  if (!goodDetection) {
    const ix = W * 0.05, iy = H * 0.05
    return [
      { x: ix,     y: iy },
      { x: W - ix, y: iy },
      { x: W - ix, y: H - iy },
      { x: ix,     y: H - iy },
    ]
  }
  return [
    { x: left,  y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left,  y: bottom },
  ]
}

// ── Crop editor with 4 draggable corner handles ───────────────────────────────
interface CropEditorProps {
  imageData: { dataUrl: string; w: number; h: number }
  onConfirm: (corners: { x: number; y: number }[]) => void
  onRetake: () => void
}

function CropEditor({ imageData, onConfirm, onRetake }: CropEditorProps) {
  const imgRef       = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const detectCanvas = useRef<HTMLCanvasElement>(null)
  const [corners, setCorners] = useState([
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.05, y: 0.95 },
  ])
  const [display, setDisplay] = useState({ w: 0, h: 0, offX: 0, offY: 0 })
  const dragging = useRef<number | null>(null)

  const refreshDisplay = useCallback(() => {
    const con = containerRef.current
    if (!con) return
    const cW = con.clientWidth, cH = con.clientHeight
    const scale = Math.min(cW / imageData.w, cH / imageData.h)
    const dW = imageData.w * scale, dH = imageData.h * scale
    setDisplay({ w: dW, h: dH, offX: (cW - dW) / 2, offY: (cH - dH) / 2 })
  }, [imageData.w, imageData.h])

  const onImgLoad = () => {
    refreshDisplay()
    const c = detectCanvas.current, img = imgRef.current
    if (!c || !img) return
    // Downscale for detection speed
    const scale = Math.min(1, 600 / Math.max(imageData.w, imageData.h))
    c.width  = Math.round(imageData.w * scale)
    c.height = Math.round(imageData.h * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const detected = detectDocumentCorners(c)
    setCorners(detected.map(p => ({
      x: p.x / c.width,
      y: p.y / c.height,
    })))
  }

  useEffect(() => {
    const ro = new ResizeObserver(refreshDisplay)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [refreshDisplay])

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const con = containerRef.current
    if (!con) return { x: 0, y: 0 }
    const rect = con.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (dragging.current === null || !display.w) return
    e.preventDefault()
    const { x, y } = getPos(e)
    const fx = Math.max(0, Math.min(1, (x - display.offX) / display.w))
    const fy = Math.max(0, Math.min(1, (y - display.offY) / display.h))
    const idx = dragging.current
    setCorners(prev => prev.map((c, i) => i === idx ? { x: fx, y: fy } : c))
  }

  const { w: dW, h: dH, offX, offY } = display
  const cornerIcons = ['↖', '↗', '↘', '↙']

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none">
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onMouseMove={onMove} onTouchMove={onMove}
        onMouseUp={() => { dragging.current = null }}
        onTouchEnd={() => { dragging.current = null }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageData.dataUrl}
          alt="Recortar"
          onLoad={onImgLoad}
          style={{ position: 'absolute', left: offX, top: offY, width: dW, height: dH, objectFit: 'fill', userSelect: 'none' }}
        />

        {dW > 0 && (
          <>
            <svg
              style={{ position: 'absolute', left: offX, top: offY, width: dW, height: dH, pointerEvents: 'none', overflow: 'visible' }}>
              <polygon
                points={corners.map(c => `${c.x * dW},${c.y * dH}`).join(' ')}
                fill="rgba(59,130,246,0.18)"
                stroke="#3b82f6"
                strokeWidth="2"
              />
            </svg>

            {corners.map((c, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: offX + c.x * dW - 20,
                  top: offY + c.y * dH - 20,
                  width: 40, height: 40,
                  touchAction: 'none',
                  zIndex: 10,
                }}
                className="flex items-center justify-center cursor-grab"
                onMouseDown={() => { dragging.current = i }}
                onTouchStart={() => { dragging.current = i }}
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white shadow-xl flex items-center justify-center text-white text-[11px] font-bold">
                  {cornerIcons[i]}
                </div>
              </div>
            ))}
          </>
        )}

        <p className="absolute top-4 left-0 right-0 text-center text-white/80 text-xs pointer-events-none drop-shadow">
          Arrastra los puntos azules para ajustar el recorte
        </p>
      </div>

      <div className="bg-gray-900 px-5 py-5 flex gap-3 flex-shrink-0">
        <button
          onClick={onRetake}
          className="flex-1 py-3 border border-white/30 text-white rounded-xl font-medium text-sm">
          Repetir foto
        </button>
        <button
          onClick={() => onConfirm(corners.map(c => ({ x: c.x * imageData.w, y: c.y * imageData.h })))}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">
          Recortar y usar
        </button>
      </div>

      <canvas ref={detectCanvas} className="hidden" />
    </div>
  )
}

// ── Scanner modal ─────────────────────────────────────────────────────────────
interface ScannerModalProps {
  onClose: () => void
  onUpload: (file: File) => Promise<void>
}

type Pagina = { dataUrl: string; blob: Blob; w: number; h: number }

function ScannerModal({ onClose, onUpload }: ScannerModalProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const galeriaRef  = useRef<HTMLInputElement>(null)
  const [phase,     setPhase]     = useState<'camera' | 'crop' | 'preview' | 'paginas'>('camera')
  const [captured,  setCaptured]  = useState<{ dataUrl: string; w: number; h: number } | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [cropped,   setCropped]   = useState<{ dataUrl: string; blob: Blob; w: number; h: number } | null>(null)
  const [paginas,   setPaginas]   = useState<Pagina[]>([])
  const [colaGaleria, setColaGaleria] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [camError,  setCamError]  = useState('')

  useEffect(() => {
    if (phase !== 'camera') return
    let active = true
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2048 }, height: { ideal: 2048 } },
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
    }).catch(() => setCamError('No se pudo acceder a la cámara. Permite el acceso en la configuración del navegador.'))
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [phase])

  function takePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current, c = canvasRef.current
    const scale = Math.min(1, 1600 / (v.videoWidth || 1600))
    c.width  = Math.round(v.videoWidth * scale)
    c.height = Math.round(v.videoHeight * scale)
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
    c.toBlob(blob => {
      if (!blob) return
      setCapturedBlob(blob)
      setCaptured({ dataUrl: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height })
      streamRef.current?.getTracks().forEach(t => t.stop())
      setPhase('crop')
    }, 'image/jpeg', 0.9)
  }

  function abrirGaleria() { galeriaRef.current?.click() }

  async function cargarSiguienteDeGaleria(cola: File[]) {
    const [siguiente, ...resto] = cola
    setColaGaleria(resto)
    if (!siguiente) { setPhase('paginas'); return }
    const img = new Image()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(siguiente)
    })
    img.src = dataUrl
    await new Promise<void>(r => { img.onload = () => r() })
    setCapturedBlob(siguiente)
    setCaptured({ dataUrl, w: img.naturalWidth, h: img.naturalHeight })
    setPhase('crop')
  }

  function onGallerySelect(files: FileList | null) {
    if (!files || files.length === 0) return
    cargarSiguienteDeGaleria([...files])
  }

  async function handleCropConfirm(corners: { x: number; y: number }[]) {
    if (!captured) return
    try {
      const img = new Image()
      img.src = captured.dataUrl
      await new Promise<void>(r => { img.onload = () => r() })
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = captured.w; srcCanvas.height = captured.h
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0)
      const warped = warpPerspective(srcCanvas, corners)
      warped.toBlob(blob => {
        if (!blob) { useCaptured(); return }
        setCropped({ dataUrl: warped.toDataURL('image/jpeg', 0.85), blob, w: warped.width, h: warped.height })
        setPhase('preview')
      }, 'image/jpeg', 0.85)
    } catch {
      useCaptured()
    }
  }

  function useCaptured() {
    if (!capturedBlob || !captured) return
    setCropped({ dataUrl: captured.dataUrl, blob: capturedBlob, w: captured.w, h: captured.h })
    setPhase('preview')
  }

  // Agrega la página recortada a la lista. Si venía de una selección múltiple
  // de galería, sigue con la siguiente imagen de la cola automáticamente;
  // si no, muestra el resumen de páginas para tomar/agregar más o terminar.
  function agregarPagina() {
    if (!cropped) return
    setPaginas(prev => [...prev, cropped])
    setCropped(null); setCaptured(null); setCapturedBlob(null)
    if (colaGaleria.length > 0) {
      cargarSiguienteDeGaleria(colaGaleria)
    } else {
      setPhase('paginas')
    }
  }

  function quitarPagina(idx: number) {
    setPaginas(prev => prev.filter((_, i) => i !== idx))
  }

  async function finalizar() {
    if (paginas.length === 0) return
    setUploading(true)
    try {
      const pdfBlob = await jpegsToPdf(paginas)
      const file = new File([pdfBlob], `escan_${Date.now()}.pdf`, { type: 'application/pdf' })
      await onUpload(file)
      onClose()
    } catch {
      setUploading(false)
    }
  }

  const inputGaleria = (
    <input ref={galeriaRef} type="file" accept="image/*" multiple className="hidden"
      onChange={e => { onGallerySelect(e.target.files); e.target.value = '' }} />
  )

  // Crop phase
  if (phase === 'crop' && captured) {
    return (
      <>
        <CropEditor
          imageData={captured}
          onConfirm={handleCropConfirm}
          onRetake={() => {
            setCaptured(null); setCapturedBlob(null)
            setPhase(colaGaleria.length > 0 || paginas.length > 0 ? 'paginas' : 'camera')
          }}
        />
        {inputGaleria}
      </>
    )
  }

  // Preview phase
  if (phase === 'preview' && cropped) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-black p-4 min-h-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cropped.dataUrl} alt="Escaneo" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
        <div className="bg-gray-900 px-5 py-5 flex gap-3 flex-shrink-0">
          <button onClick={() => setPhase('crop')}
            className="flex-1 py-3 border border-white/30 text-white rounded-xl font-medium text-sm">
            Ajustar recorte
          </button>
          <button onClick={agregarPagina}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">
            + Agregar página
          </button>
        </div>
      </div>
    )
  }

  // Resumen de páginas: agregar más (cámara o galería), quitar, o terminar
  if (phase === 'paginas') {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <p className="text-white font-semibold text-sm">{paginas.length} página{paginas.length !== 1 ? 's' : ''}</p>
          <button onClick={onClose} className="text-white/70 hover:text-white text-sm">✕ Cancelar</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 min-h-0">
          <div className="grid grid-cols-3 gap-2">
            {paginas.map((p, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border border-white/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={`Página ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{i + 1}</span>
                <button onClick={() => quitarPagina(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center">✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 px-5 py-5 flex flex-col gap-2 flex-shrink-0">
          <div className="flex gap-2">
            <button onClick={() => setPhase('camera')}
              className="flex-1 py-3 border border-white/30 text-white rounded-xl font-medium text-sm">
              📷 Tomar foto
            </button>
            <button onClick={abrirGaleria}
              className="flex-1 py-3 border border-white/30 text-white rounded-xl font-medium text-sm">
              🖼️ Elegir de galería
            </button>
          </div>
          <button onClick={finalizar} disabled={paginas.length === 0 || uploading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50">
            {uploading ? 'Subiendo...' : `Guardar documento (${paginas.length} página${paginas.length !== 1 ? 's' : ''})`}
          </button>
        </div>
        {inputGaleria}
      </div>
    )
  }

  // Camera phase
  const frameCorners = [
    'top-0 left-0 border-l-2 border-t-2 rounded-tl',
    'top-0 right-0 border-r-2 border-t-2 rounded-tr',
    'bottom-0 left-0 border-l-2 border-b-2 rounded-bl',
    'bottom-0 right-0 border-r-2 border-b-2 rounded-br',
  ]

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {camError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-5">
          <p className="text-white text-base">{camError}</p>
          <button onClick={abrirGaleria}
            className="px-6 py-3 border border-white/30 text-white rounded-xl font-semibold text-sm">
            🖼️ Elegir de galería
          </button>
          <button onClick={onClose}
            className="px-6 py-3 bg-white text-gray-900 rounded-xl font-semibold text-sm">
            Cerrar
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative" style={{ width: '86%', height: '60%' }}>
              {frameCorners.map((cls, i) => (
                <div key={i} className={`absolute ${cls} w-7 h-7 border-white`} />
              ))}
              <p className="absolute -bottom-8 left-0 right-0 text-center text-white/80 text-xs">
                Centra el documento dentro del marco
              </p>
            </div>
          </div>
          {paginas.length > 0 && (
            <button onClick={() => setPhase('paginas')}
              className="absolute top-4 right-4 bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              {paginas.length} página{paginas.length !== 1 ? 's' : ''} →
            </button>
          )}
          <div className="absolute bottom-0 inset-x-0">
            <div className="flex items-center justify-around py-6 px-8 bg-black/60">
              <button onClick={onClose}
                className="text-white text-sm font-medium px-3 py-2 rounded-lg bg-white/10">
                Cancelar
              </button>
              <button onClick={takePhoto}
                className="flex items-center justify-center rounded-full border-4 border-white bg-transparent"
                style={{ width: 72, height: 72 }}>
                <div className="rounded-full bg-white" style={{ width: 56, height: 56 }} />
              </button>
              <button onClick={abrirGaleria}
                className="text-white text-sm font-medium px-3 py-2 rounded-lg bg-white/10">
                🖼️ Galería
              </button>
            </div>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
      {inputGaleria}
    </div>
  )
}

// ── Sección de archivos de un tipo de documento (o "Otros") ───────────────────
function SeccionDocumento({
  titulo, requerido, archivos, uploading, isMobile, onFiles, onScan, onEliminar,
}: {
  titulo: string; requerido: boolean; archivos: Archivo[]; uploading: boolean; isMobile: boolean
  onFiles: (files: FileList | null) => void; onScan: () => void; onEliminar: (id: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cumplido = !requerido || archivos.length > 0

  return (
    <div className={`border rounded-xl p-3 space-y-2 ${requerido && !cumplido ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          {titulo}
          {requerido && (cumplido
            ? <span className="text-green-600">✓</span>
            : <span className="text-red-500 text-[10px] font-bold">· obligatorio</span>)}
        </p>
      </div>

      <input ref={fileRef} type="file" multiple accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*"
        onChange={e => { onFiles(e.target.files); if (fileRef.current) fileRef.current.value = '' }} className="hidden" />

      {archivos.length > 0 && (
        <div className="space-y-1">
          {archivos.map(a => (
            <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <a href={`/api/archivos-cliente/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 flex-1">
                <span className="flex-shrink-0 text-sm">{ICONO[a.tipo] ?? '📎'}</span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-700 hover:text-blue-700 truncate">{a.nombre_archivo ?? 'Archivo'}</p>
                  <p className="text-[10px] text-gray-400">{fmtFecha(a.created_at)}{a.storage_location === 'drive' ? ' · Drive' : ''}</p>
                </div>
              </a>
              {a.storage_location === 'drive' && a.drive_url && (
                <a href={a.drive_url} target="_blank" rel="noopener noreferrer" title="Abrir en Google Drive"
                  className="flex-shrink-0 text-[11px] text-blue-500 hover:text-blue-700 px-1 py-0.5 rounded hover:bg-blue-50">Drive ↗</a>
              )}
              <button onClick={() => onEliminar(a.id)} className="flex-shrink-0 text-red-400 hover:text-red-600 text-[11px]">Eliminar</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex-1 py-1.5 border-2 border-dashed border-gray-300 rounded-lg text-[11px] text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50">
          {uploading ? 'Subiendo...' : '+ Subir archivo'}
        </button>
        {isMobile && (
          <button onClick={onScan} disabled={uploading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-semibold disabled:opacity-50 flex-shrink-0">
            📷 Escanear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ArchivosTab({ clienteId }: Props) {
  const supabase = createClient()
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [tiposCatalogo, setTiposCatalogo] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState('')
  const [scannerTipo, setScannerTipo] = useState<string | null | 'CERRADO'>('CERRADO')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  const cargar = useCallback(async () => {
    const [{ data: archs }, { data: reglas }] = await Promise.all([
      supabase.from('archivos_cliente')
        .select('id, tipo, nombre_archivo, created_at, storage_location, drive_url, tipo_documento')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false }),
      supabase.from('reglas_etapa').select('documentos_requeridos').eq('campo', 'documento_requerido').eq('activa', true),
    ])
    setArchivos((archs ?? []) as Archivo[])
    const catalogo = new Set<string>()
    for (const r of reglas ?? []) {
      for (const d of (r.documentos_requeridos ?? []) as string[]) catalogo.add(d)
    }
    setTiposCatalogo([...catalogo])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function uploadFile(file: File, tipoDocumento: string | null) {
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('cliente_id', clienteId)
      if (tipoDocumento) fd.append('tipo_documento', tipoDocumento)
      const res = await fetch('/api/admin/ventas/archivos/subir', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Error subiendo ${file.name}`)
      }
      await cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir')
    }
    setUploading(false)
  }

  async function onFiles(files: FileList | null, tipoDocumento: string | null) {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) await uploadFile(file, tipoDocumento)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este archivo?')) return
    const res = await fetch(`/api/archivos-cliente/${id}`, { method: 'DELETE' })
    if (res.ok) setArchivos(p => p.filter(a => a.id !== id))
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  const archivosOtros = archivos.filter(a => !a.tipo_documento || !tiposCatalogo.includes(a.tipo_documento))

  return (
    <div className="space-y-3">
      {scannerTipo !== 'CERRADO' && (
        <ScannerModal
          onClose={() => setScannerTipo('CERRADO')}
          onUpload={async (file) => { await uploadFile(file, scannerTipo) }}
        />
      )}

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Archivos</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {tiposCatalogo.map(tipo => (
        <SeccionDocumento
          key={tipo}
          titulo={tipo}
          requerido
          archivos={archivos.filter(a => a.tipo_documento === tipo)}
          uploading={uploading}
          isMobile={isMobile}
          onFiles={files => onFiles(files, tipo)}
          onScan={() => setScannerTipo(tipo)}
          onEliminar={eliminar}
        />
      ))}

      <SeccionDocumento
        titulo="Otros archivos"
        requerido={false}
        archivos={archivosOtros}
        uploading={uploading}
        isMobile={isMobile}
        onFiles={files => onFiles(files, null)}
        onScan={() => setScannerTipo(null)}
        onEliminar={eliminar}
      />
    </div>
  )
}
