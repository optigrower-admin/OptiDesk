'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx-js-style'

export interface ResultadoImportacion {
  exitosos: number
  errores: { fila: number; mensaje: string }[]
}

export interface TarjetaPreview {
  titulo: string
  lineas: string[]
  error?: string
}

export type ObligatoriedadColumna = 'si' | 'no' | 'condicional'

const COLOR_OBLIGATORIEDAD: Record<ObligatoriedadColumna, string> = {
  si: 'C0392B',
  condicional: 'B7791F',
  no: '1E7A34',
}
const TEXTO_LEYENDA: Record<ObligatoriedadColumna, string> = {
  si: 'Rojo = obligatorio, siempre debes llenarlo',
  condicional: 'Naranja = obligatorio solo en algunos casos (lee lo que dice el encabezado)',
  no: 'Verde = opcional, puedes dejarlo vacío',
}

interface ImportadorExcelProps {
  titulo: string
  descripcion: string
  nombreArchivoPlantilla: string
  encabezados: string[]
  /** Una entrada por cada encabezado, en el mismo orden, para colorear la plantilla. Si se omite, no se colorea. */
  obligatoriedad?: ObligatoriedadColumna[]
  filasEjemplo: string[][]
  notas?: string[]
  /** Si se pasa, la vista previa muestra estas tarjetas (cómo quedaría cada registro en OptiDesk) en vez de la tabla cruda del Excel. */
  vistaPrevia?: (filas: Record<string, string>[]) => TarjetaPreview[]
  procesarFilas: (filas: Record<string, string>[]) => Promise<ResultadoImportacion>
  onCompletado?: () => void
}

export function ImportadorExcel({
  titulo, descripcion, nombreArchivoPlantilla, encabezados, obligatoriedad, filasEjemplo, notas, vistaPrevia, procesarFilas, onCompletado,
}: ImportadorExcelProps) {
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<Record<string, string>[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState('')
  const [previewAbierto, setPreviewAbierto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const descargarPlantilla = () => {
    const wsData = [encabezados, ...filasEjemplo]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = encabezados.map(() => ({ wch: 24 }))
    if (obligatoriedad?.length) {
      encabezados.forEach((_, i) => {
        const ref = XLSX.utils.encode_cell({ r: 0, c: i })
        const cell = ws[ref]
        if (!cell) return
        const estado = obligatoriedad[i] ?? 'no'
        cell.s = {
          fill: { fgColor: { rgb: COLOR_OBLIGATORIEDAD[estado] } },
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { wrapText: true, vertical: 'center' },
        }
      })
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Datos')

    const leyenda: string[][] = obligatoriedad?.length
      ? [['Colores de los encabezados de la hoja "Datos":'], ...(['si', 'condicional', 'no'] as ObligatoriedadColumna[]).map((k) => [TEXTO_LEYENDA[k]]), ['']]
      : []
    if (notas?.length || leyenda.length) {
      const wsNotas = XLSX.utils.aoa_to_sheet([['Instrucciones'], ...leyenda, ...(notas ?? []).map((n) => [n])])
      wsNotas['!cols'] = [{ wch: 95 }]
      if (obligatoriedad?.length) {
        ;(['si', 'condicional', 'no'] as ObligatoriedadColumna[]).forEach((k, idx) => {
          const ref = XLSX.utils.encode_cell({ r: 1 + idx, c: 0 })
          const cell = wsNotas[ref]
          if (cell) cell.s = { font: { bold: true, color: { rgb: COLOR_OBLIGATORIEDAD[k] } } }
        })
      }
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
    setPreviewAbierto(false)
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

  const columnasPreview = filas.length ? Object.keys(filas[0]) : []
  const tarjetasPreview = previewAbierto && vistaPrevia ? vistaPrevia(filas) : null

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
              <button onClick={() => setPreviewAbierto(true)} disabled={importando}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-xs font-semibold transition-colors">
                {importando ? 'Importando...' : 'Ver vista previa e importar'}
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

      {previewAbierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {tarjetasPreview
                  ? `Vista previa — ${tarjetasPreview.length} registro${tarjetasPreview.length !== 1 ? 's' : ''} que se van a crear/actualizar`
                  : `Vista previa — ${filas.length} fila${filas.length !== 1 ? 's' : ''} que se van a importar`}
              </h3>
              <button onClick={() => setPreviewAbierto(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="px-4 pt-2 text-xs text-gray-500">
              {tarjetasPreview
                ? 'Así quedaría cada registro en OptiDesk. Revisa que todo esté correcto antes de guardar — si algo está mal, cancela, corrige el Excel y vuelve a elegirlo.'
                : 'Revisa que los datos detectados sean correctos antes de guardarlos en el sistema. Si algo está mal, cancela, corrige el Excel y vuelve a elegirlo.'}
            </p>
            <div className="flex-1 overflow-auto p-4">
              {tarjetasPreview ? (
                <div className="space-y-2">
                  {tarjetasPreview.map((t, i) => (
                    <div key={i} className={`border rounded-lg p-3 text-xs ${t.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                      <p className={`font-semibold mb-1 ${t.error ? 'text-red-700' : 'text-gray-800'}`}>{t.titulo}</p>
                      {t.error ? (
                        <p className="text-red-600">⚠ No se importará: {t.error}</p>
                      ) : (
                        <div className="text-gray-600 space-y-0.5">
                          {t.lineas.map((linea, j) => <p key={j} className="whitespace-pre-wrap">{linea}</p>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr>
                      <th className="sticky top-0 bg-gray-100 border border-gray-200 px-2 py-1.5 text-left text-gray-500 font-semibold">#</th>
                      {columnasPreview.map((col) => (
                        <th key={col} className="sticky top-0 bg-gray-100 border border-gray-200 px-2 py-1.5 text-left text-gray-700 font-semibold whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-2 py-1 text-gray-400">{i + 2}</td>
                        {columnasPreview.map((col) => (
                          <td key={col} className="border border-gray-200 px-2 py-1 text-gray-700 whitespace-nowrap">{fila[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setPreviewAbierto(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors">
                Cancelar
              </button>
              <button onClick={importar} disabled={importando}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-xs font-semibold transition-colors">
                {importando ? 'Importando...' : 'Aceptar e importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
