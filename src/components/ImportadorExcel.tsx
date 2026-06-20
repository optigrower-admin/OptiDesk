'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

export interface ResultadoImportacion {
  exitosos: number
  errores: { fila: number; mensaje: string }[]
}

interface ImportadorExcelProps {
  titulo: string
  descripcion: string
  nombreArchivoPlantilla: string
  encabezados: string[]
  filasEjemplo: string[][]
  notas?: string[]
  procesarFilas: (filas: Record<string, string>[]) => Promise<ResultadoImportacion>
  onCompletado?: () => void
}

export function ImportadorExcel({
  titulo, descripcion, nombreArchivoPlantilla, encabezados, filasEjemplo, notas, procesarFilas, onCompletado,
}: ImportadorExcelProps) {
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<Record<string, string>[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const descargarPlantilla = () => {
    const wsData = [encabezados, ...filasEjemplo]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = encabezados.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Datos')
    if (notas?.length) {
      const wsNotas = XLSX.utils.aoa_to_sheet([['Instrucciones'], ...notas.map((n) => [n])])
      wsNotas['!cols'] = [{ wch: 90 }]
      XLSX.utils.book_append_sheet(wb, wsNotas, 'Instrucciones')
    }
    XLSX.writeFile(wb, nombreArchivoPlantilla)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setResultado(null)
    setNombreArchivo(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false })
        if (!rows.length) { setError('El archivo no tiene filas de datos.'); return }
        setFilas(rows)
      } catch {
        setError('No se pudo leer el archivo. Verifica que sea un .xlsx válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const importar = async () => {
    if (!filas.length) return
    setImportando(true); setError(''); setResultado(null)
    try {
      const res = await procesarFilas(filas)
      setResultado(res)
      if (res.errores.length === 0) {
        setFilas([]); setNombreArchivo('')
        if (inputRef.current) inputRef.current.value = ''
      }
      onCompletado?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setAbierto(!abierto)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">{titulo}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${abierto ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {abierto && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <p className="text-xs text-gray-500">{descripcion}</p>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={descargarPlantilla}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Descargar plantilla
            </button>
            <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer">
              Elegir archivo Excel
              <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />
            </label>
            {nombreArchivo && <span className="text-xs text-gray-400">{nombreArchivo}</span>}
          </div>

          {filas.length > 0 && !resultado && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-600">{filas.length} fila{filas.length !== 1 ? 's' : ''} detectada{filas.length !== 1 ? 's' : ''}.</p>
              <button onClick={importar} disabled={importando}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-xs font-semibold transition-colors">
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {resultado && (
            <div className="text-xs space-y-1">
              <p className={resultado.errores.length ? 'text-amber-600' : 'text-green-600'}>
                {resultado.exitosos} importado{resultado.exitosos !== 1 ? 's' : ''} correctamente
                {resultado.errores.length > 0 && `, ${resultado.errores.length} con error`}
              </p>
              {resultado.errores.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-0.5">
                  {resultado.errores.map((e, i) => (
                    <p key={i} className="text-red-600">Fila {e.fila}: {e.mensaje}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
