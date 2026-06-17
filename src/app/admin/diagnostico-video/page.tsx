'use client'
export const dynamic = 'force-dynamic'
import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface TestResult {
  step: string
  status: 'ok' | 'error' | 'running' | 'skip'
  detail: string
  ms?: number
}

function xhrPut(url: string, body: ArrayBuffer, contentType: string, onProgress?: (pct: number) => void): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = 120000
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText?.slice(0, 800) ?? '' })
    xhr.onerror = () => reject(new Error('onerror — posible CORS bloqueado o sin conexión'))
    xhr.ontimeout = () => reject(new Error('Timeout (120s) — conexión muy lenta o archivo grande'))
    xhr.send(body)
  })
}

function makeBlob(sizeMB: number): ArrayBuffer {
  return new Uint8Array(sizeMB * 1024 * 1024).buffer
}

export default function DiagnosticoVideoPage() {
  const { profile, loading } = useAuth()
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)
  const [fileProgress, setFileProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (step: string, patch: Partial<TestResult>) =>
    setResults(prev => prev.map(r => r.step === step ? { ...r, ...patch } : r))

  const add = (r: TestResult) => setResults(prev => [...prev, r])

  const runSyntheticTests = async () => {
    setRunning(true)
    setResults([])

    // ── Paso 1: Presigned URL desde el servidor ──
    add({ step: '1. Presigned URL del servidor', status: 'running', detail: 'Solicitando...' })
    const t1 = Date.now()
    let presignedUrl = ''
    let testKey = ''
    const contentType = 'video/mp4'
    try {
      const res = await fetch('/api/upload/diagnostico')
      const data = await res.json()
      if (!res.ok || !data.presignedUrl) throw new Error(data.error ?? `HTTP ${res.status}`)
      presignedUrl = data.presignedUrl
      testKey = data.key
      update('1. Presigned URL del servidor', { status: 'ok', detail: 'URL generada ✓', ms: Date.now() - t1 })
    } catch (err) {
      update('1. Presigned URL del servidor', { status: 'error', detail: String(err), ms: Date.now() - t1 })
      setRunning(false)
      return
    }

    // ── Paso 2: Subir 1 MB (prueba CORS + credenciales) ──
    add({ step: '2. Subir blob 1 MB', status: 'running', detail: 'Enviando...' })
    const t2 = Date.now()
    try {
      const buf = makeBlob(1)
      const { status, body } = await xhrPut(presignedUrl, buf, contentType)
      if (status >= 200 && status < 300) {
        update('2. Subir blob 1 MB', { status: 'ok', detail: `HTTP ${status} ✓`, ms: Date.now() - t2 })
      } else {
        throw new Error(`HTTP ${status}: ${body}`)
      }
    } catch (err) {
      update('2. Subir blob 1 MB', { status: 'error', detail: String(err), ms: Date.now() - t2 })
      // Si el 1MB falla, casi seguro es CORS → parar
      add({ step: '3. Subir blob 10 MB', status: 'skip', detail: 'Saltado (paso 2 falló)' })
      add({ step: '4. Subir blob 30 MB', status: 'skip', detail: 'Saltado (paso 2 falló)' })
      await cleanup(testKey)
      setRunning(false)
      return
    }

    // ── Paso 3: Subir 10 MB (prueba archivos medianos) ──
    add({ step: '3. Subir blob 10 MB', status: 'running', detail: 'Enviando...' })
    const t3 = Date.now()
    try {
      const buf = makeBlob(10)
      const { status, body } = await xhrPut(presignedUrl, buf, contentType)
      if (status >= 200 && status < 300) {
        update('3. Subir blob 10 MB', { status: 'ok', detail: `HTTP ${status} ✓`, ms: Date.now() - t3 })
      } else {
        throw new Error(`HTTP ${status}: ${body}`)
      }
    } catch (err) {
      update('3. Subir blob 10 MB', { status: 'error', detail: String(err), ms: Date.now() - t3 })
    }

    // ── Paso 4: Subir 30 MB (simula un video de ~30 segundos comprimido) ──
    add({ step: '4. Subir blob 30 MB', status: 'running', detail: 'Enviando...' })
    const t4 = Date.now()
    try {
      const buf = makeBlob(30)
      const { status, body } = await xhrPut(presignedUrl, buf, contentType)
      if (status >= 200 && status < 300) {
        update('4. Subir blob 30 MB', { status: 'ok', detail: `HTTP ${status} ✓`, ms: Date.now() - t4 })
      } else {
        throw new Error(`HTTP ${status}: ${body}`)
      }
    } catch (err) {
      update('4. Subir blob 30 MB', { status: 'error', detail: String(err), ms: Date.now() - t4 })
    }

    await cleanup(testKey)
    setRunning(false)
  }

  const cleanup = async (key: string) => {
    if (!key) return
    try {
      await fetch('/api/upload/diagnostico', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
    } catch { /* ignore */ }
  }

  const runRealFileTest = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setRunning(true)
    setFileProgress(0)

    add({ step: `5. Leer archivo real (${(file.size / 1024 / 1024).toFixed(1)} MB)`, status: 'running', detail: 'Leyendo desde almacenamiento...' })
    const t5 = Date.now()
    let buffer: ArrayBuffer
    try {
      buffer = await file.arrayBuffer()
      update(`5. Leer archivo real (${(file.size / 1024 / 1024).toFixed(1)} MB)`, {
        status: 'ok',
        detail: `Leído en memoria ✓ (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
        ms: Date.now() - t5,
      })
    } catch (err) {
      update(`5. Leer archivo real (${(file.size / 1024 / 1024).toFixed(1)} MB)`, {
        status: 'error',
        detail: `No se pudo leer: ${String(err)}`,
        ms: Date.now() - t5,
      })
      setRunning(false)
      return
    }

    // Presign para el archivo real
    add({ step: '6. Presigned URL para archivo real', status: 'running', detail: 'Solicitando...' })
    const t6 = Date.now()
    let presignedUrl2 = ''
    let testKey2 = ''
    try {
      const res = await fetch('/api/upload/diagnostico')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      presignedUrl2 = data.presignedUrl
      testKey2 = data.key
      update('6. Presigned URL para archivo real', { status: 'ok', detail: 'URL generada ✓', ms: Date.now() - t6 })
    } catch (err) {
      update('6. Presigned URL para archivo real', { status: 'error', detail: String(err), ms: Date.now() - t6 })
      setRunning(false)
      return
    }

    // Subir el archivo real como ArrayBuffer
    add({ step: '7. Subir archivo real (ArrayBuffer)', status: 'running', detail: '0%' })
    const t7 = Date.now()
    try {
      const { status, body } = await xhrPut(presignedUrl2, buffer, 'video/mp4', (pct) => {
        setFileProgress(pct)
        update('7. Subir archivo real (ArrayBuffer)', { detail: `${pct}%` })
      })
      if (status >= 200 && status < 300) {
        update('7. Subir archivo real (ArrayBuffer)', {
          status: 'ok',
          detail: `HTTP ${status} ✓ — subida completa`,
          ms: Date.now() - t7,
        })
      } else {
        throw new Error(`HTTP ${status}: ${body}`)
      }
    } catch (err) {
      update('7. Subir archivo real (ArrayBuffer)', {
        status: 'error',
        detail: String(err),
        ms: Date.now() - t7,
      })
    }

    await cleanup(testKey2)
    if (fileRef.current) fileRef.current.value = ''
    setRunning(false)
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>
  if (!profile) return <div className="p-8 text-gray-400">Sin sesión activa.</div>

  const statusIcon = (s: TestResult['status']) =>
    s === 'ok' ? '✅' : s === 'error' ? '❌' : s === 'running' ? '⏳' : '⬜'

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Diagnóstico: subida de video</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ejecuta las pruebas para identificar exactamente dónde falla la subida de videos grandes.
        </p>
      </div>

      {/* Pruebas sintéticas */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div>
          <p className="font-semibold text-sm text-gray-800">Paso A — Prueba con datos sintéticos</p>
          <p className="text-xs text-gray-500">Sube blobs de 1 MB, 10 MB y 30 MB. Detecta CORS y límites de R2.</p>
        </div>
        <button
          onClick={runSyntheticTests}
          disabled={running}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {running ? 'Ejecutando...' : 'Ejecutar prueba sintética'}
        </button>
      </div>

      {/* Prueba con archivo real */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div>
          <p className="font-semibold text-sm text-gray-800">Paso B — Prueba con video real</p>
          <p className="text-xs text-gray-500">Selecciona el video que falla. Prueba lectura (arrayBuffer) + subida a R2.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mp4,.3gp,.mov,.avi,.mkv"
          className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <button
          onClick={runRealFileTest}
          disabled={running}
          className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {running ? `Subiendo... ${fileProgress}%` : 'Probar video seleccionado'}
        </button>
      </div>

      {/* Resultados */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Resultados</p>
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-xl p-3 border ${
                r.status === 'ok' ? 'bg-green-50 border-green-200' :
                r.status === 'error' ? 'bg-red-50 border-red-200' :
                r.status === 'running' ? 'bg-blue-50 border-blue-200' :
                'bg-gray-50 border-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{statusIcon(r.status)}</span>
                <span className="font-semibold text-sm text-gray-900 flex-1">{r.step}</span>
                {r.ms !== undefined && (
                  <span className="text-xs text-gray-400 flex-shrink-0">{r.ms < 1000 ? `${r.ms}ms` : `${(r.ms / 1000).toFixed(1)}s`}</span>
                )}
              </div>
              <p className={`text-xs mt-1 font-mono break-all ${r.status === 'error' ? 'text-red-700' : 'text-gray-600'}`}>
                {r.detail}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Interpretación */}
      {results.some(r => r.status === 'error') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs space-y-1.5 text-amber-800">
          <p className="font-semibold">Cómo interpretar los errores:</p>
          <p>• <strong>Paso 1 falla</strong> → problema con credenciales R2 en el servidor</p>
          <p>• <strong>Paso 2 falla (onerror)</strong> → CORS bloqueado en el bucket R2</p>
          <p>• <strong>Paso 2 falla (HTTP 403)</strong> → content-type no permitido en firma</p>
          <p>• <strong>Paso 3 ó 4 fallan</strong> → límite de tamaño o timeout de red</p>
          <p>• <strong>Paso 5 falla</strong> → el dispositivo no puede leer archivos grandes (RAM)</p>
          <p>• <strong>Paso 7 falla</strong> → el archivo se lee bien pero R2 lo rechaza</p>
          <p className="mt-2 text-amber-700">Captura una pantalla de estos resultados y compártela.</p>
        </div>
      )}

      {results.length > 0 && results.every(r => r.status === 'ok') && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          ✅ Todas las pruebas pasaron. La infraestructura R2 funciona correctamente desde este dispositivo.
        </div>
      )}
    </div>
  )
}
