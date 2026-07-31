'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'

type TablaInfo = { tabla: string; modulo: string; descripcion: string }
type MiAcceso = {
  puedeAcceder: boolean
  puedeExportar?: boolean
  limiteFilasPreview?: number
  tablas?: Record<string, TablaInfo[]>
  esGerencia?: boolean
}
type ResultadoQuery = { columnas: string[]; filas: Record<string, unknown>[]; filasRetornadas: number; limitePreview: number; duracionMs: number }
type Guardada = { id: string; nombre: string; query_text: string; created_at: string }
type Historial = { id: string; query_text: string; status: 'OK' | 'ERROR' | 'TIMEOUT'; filas_retornadas: number | null; duracion_ms: number | null; error_mensaje: string | null; created_at: string }
type ExportJob = { id: string; formato: string; status: 'PENDIENTE' | 'PROCESANDO' | 'LISTO' | 'ERROR'; archivo_url: string | null; filas_totales: number | null; error_mensaje: string | null; created_at: string }

export default function ConsultasSQLPage() {
  const [acceso, setAcceso] = useState<MiAcceso | null>(null)
  const [cargandoAcceso, setCargandoAcceso] = useState(true)
  const [query, setQuery] = useState('SELECT *\nFROM clientes\nLIMIT 50')
  const [ejecutando, setEjecutando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoQuery | null>(null)
  const [errorQuery, setErrorQuery] = useState<string | null>(null)
  const [tab, setTab] = useState<'resultado' | 'historial' | 'guardadas'>('resultado')
  const [historial, setHistorial] = useState<Historial[]>([])
  const [guardadas, setGuardadas] = useState<Guardada[]>([])
  const [nombreGuardar, setNombreGuardar] = useState('')
  const [mostrarGuardar, setMostrarGuardar] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [jobActual, setJobActual] = useState<ExportJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/admin/sql-console/mi-acceso')
      .then(r => r.json())
      .then(setAcceso)
      .finally(() => setCargandoAcceso(false))
  }, [])

  const cargarHistorial = useCallback(async () => {
    const r = await fetch('/api/admin/sql-console/historial')
    const j = await r.json()
    setHistorial(j.historial ?? [])
  }, [])

  const cargarGuardadas = useCallback(async () => {
    const r = await fetch('/api/admin/sql-console/guardadas')
    const j = await r.json()
    setGuardadas(j.guardadas ?? [])
  }, [])

  useEffect(() => {
    if (tab === 'historial') cargarHistorial()
    if (tab === 'guardadas') cargarGuardadas()
  }, [tab, cargarHistorial, cargarGuardadas])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const ejecutar = async () => {
    setEjecutando(true)
    setErrorQuery(null)
    setResultado(null)
    try {
      const r = await fetch('/api/admin/sql-console/ejecutar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const j = await r.json()
      if (!r.ok) { setErrorQuery(j.error ?? 'Error ejecutando la consulta'); return }
      setResultado(j)
      setTab('resultado')
    } catch {
      setErrorQuery('No se pudo conectar con el servidor')
    } finally {
      setEjecutando(false)
    }
  }

  const guardarConsulta = async () => {
    if (!nombreGuardar.trim()) return
    await fetch('/api/admin/sql-console/guardadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreGuardar.trim(), query_text: query }),
    })
    setNombreGuardar('')
    setMostrarGuardar(false)
    if (tab === 'guardadas') cargarGuardadas()
  }

  const borrarGuardada = async (id: string) => {
    await fetch('/api/admin/sql-console/guardadas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    cargarGuardadas()
  }

  const exportar = async (formato: 'csv' | 'xlsx' | 'json' | 'txt') => {
    setExportando(true)
    setJobActual(null)
    try {
      const r = await fetch('/api/admin/sql-console/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, formato }),
      })
      const j = await r.json()
      if (!r.ok) { setErrorQuery(j.error ?? 'No se pudo iniciar la exportación'); setExportando(false); return }
      setJobActual(j.job)
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const rs = await fetch(`/api/admin/sql-console/exportar/${j.job.id}`)
        const js = await rs.json()
        setJobActual(js.job)
        if (js.job.status === 'LISTO' || js.job.status === 'ERROR') {
          clearInterval(pollRef.current!)
          setExportando(false)
          if (js.job.status === 'LISTO' && js.urlDescarga) {
            window.open(js.urlDescarga, '_blank')
          }
        }
      }, 3000)
    } catch {
      setErrorQuery('No se pudo iniciar la exportación')
      setExportando(false)
    }
  }

  const insertarTabla = (tabla: string) => {
    setQuery(q => `${q.trim() ? q.trim() + '\n' : ''}SELECT * FROM ${tabla} LIMIT 50`)
  }

  if (cargandoAcceso) {
    return <div className="p-6 flex justify-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!acceso?.puedeAcceder) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-lg mx-auto text-center">
          <p className="text-2xl mb-2">🗄️</p>
          <h1 className="font-bold text-gray-900 mb-1">Consultas SQL</h1>
          <p className="text-sm text-gray-500">No tienes acceso a este módulo. Pídele a Gerencia que te habilite el acceso desde Consultas SQL → Permisos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="border-b border-gray-200 px-4 py-2.5 flex items-center justify-between bg-white">
        <div>
          <h1 className="font-bold text-gray-900 text-sm">🗄️ Consultas SQL</h1>
          <p className="text-xs text-gray-400">Solo lectura · resultados limitados a {acceso.limiteFilasPreview ?? 500} filas en preview</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMostrarGuardar(true)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium text-gray-700">
            Guardar consulta
          </button>
          <button onClick={ejecutar} disabled={ejecutando} className="text-xs px-4 py-1.5 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50">
            {ejecutando ? 'Ejecutando...' : '▶ Ejecutar (Ctrl+Enter)'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo: tablas */}
        <div className="w-56 border-r border-gray-200 bg-gray-50 overflow-y-auto p-3 shrink-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Tablas disponibles</p>
          {Object.entries(acceso.tablas ?? {}).map(([modulo, tablas]) => (
            <div key={modulo} className="mb-3">
              <p className="text-[11px] font-semibold text-gray-500 mb-1">{modulo}</p>
              {tablas.map(t => (
                <button
                  key={t.tabla}
                  onClick={() => insertarTabla(t.tabla)}
                  title={t.descripcion}
                  className="w-full text-left text-xs font-mono text-gray-600 hover:bg-white hover:text-blue-700 rounded px-2 py-1"
                >
                  {t.tabla}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Panel central + inferior */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-64 border-b border-gray-200 shrink-0">
            <Editor
              language="sql"
              theme="vs"
              value={query}
              onChange={v => setQuery(v ?? '')}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => ejecutar())
              }}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            />
          </div>

          <div className="border-b border-gray-200 flex items-center gap-4 px-4 bg-white shrink-0">
            {(['resultado', 'historial', 'guardadas'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-xs font-semibold py-2.5 border-b-2 ${tab === t ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {t === 'resultado' ? 'Resultado' : t === 'historial' ? 'Historial' : 'Guardadas'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-3">
            {errorQuery && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">{errorQuery}</div>
            )}

            {tab === 'resultado' && (
              <>
                {resultado && (
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {resultado.filasRetornadas} fila(s){resultado.filasRetornadas >= resultado.limitePreview ? ` (mostrando primeras ${resultado.limitePreview})` : ''} · {resultado.duracionMs}ms
                    </p>
                    {acceso.puedeExportar && (
                      <div className="flex items-center gap-1.5">
                        {(['csv', 'xlsx', 'json', 'txt'] as const).map(f => (
                          <button key={f} onClick={() => exportar(f)} disabled={exportando} className="text-[11px] px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 font-medium text-gray-600 disabled:opacity-50 uppercase">
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {jobActual && (
                  <div className="mb-2 text-xs text-gray-500">
                    Exportación ({jobActual.formato}): {jobActual.status}
                    {jobActual.status === 'ERROR' && jobActual.error_mensaje ? ` — ${jobActual.error_mensaje}` : ''}
                  </div>
                )}
                {resultado && (
                  <div className="overflow-auto border border-gray-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {resultado.columnas.map(c => (
                            <th key={c} className="text-left px-3 py-1.5 font-semibold text-gray-500 whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {resultado.filas.map((fila, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            {resultado.columnas.map(c => (
                              <td key={c} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{String(fila[c] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!resultado && !errorQuery && (
                  <p className="text-sm text-gray-400 text-center py-8">Escribe una consulta y presiona Ejecutar.</p>
                )}
              </>
            )}

            {tab === 'historial' && (
              <div className="space-y-1.5">
                {historial.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin consultas recientes.</p>}
                {historial.map(h => (
                  <button
                    key={h.id}
                    onClick={() => { setQuery(h.query_text); setTab('resultado') }}
                    className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-300"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${h.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{h.status}</span>
                      <span className="text-[11px] text-gray-400">{new Date(h.created_at).toLocaleString('es-CO')}</span>
                    </div>
                    <p className="text-xs font-mono text-gray-600 truncate">{h.query_text}</p>
                    {h.error_mensaje && <p className="text-[11px] text-red-500 mt-0.5">{h.error_mensaje}</p>}
                  </button>
                ))}
              </div>
            )}

            {tab === 'guardadas' && (
              <div className="space-y-1.5">
                {guardadas.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No tienes consultas guardadas.</p>}
                {guardadas.map(g => (
                  <div key={g.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                    <button onClick={() => { setQuery(g.query_text); setTab('resultado') }} className="text-left flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{g.nombre}</p>
                      <p className="text-xs font-mono text-gray-500 truncate">{g.query_text}</p>
                    </button>
                    <button onClick={() => borrarGuardada(g.id)} className="text-xs text-red-500 hover:text-red-700 shrink-0">Borrar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {mostrarGuardar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">Guardar consulta</h3>
            <input
              autoFocus
              value={nombreGuardar}
              onChange={e => setNombreGuardar(e.target.value)}
              placeholder="Nombre de la consulta"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setMostrarGuardar(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarConsulta} disabled={!nombreGuardar.trim()} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
