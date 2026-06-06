'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatBytes } from '@/lib/utils'

interface Tenant {
  id: string
  nombre: string
  storage_usado_bytes: number
  archivado_drive_habilitado: boolean
  drive_folder_id: string | null
  google_refresh_token: string | null
}

interface Resultado {
  archivados: number
  mbLiberados: number
  errores: string[]
}

const LIMITE_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB — límite R2 gratuito
const ALERTA_BYTES =  8 * 1024 * 1024 * 1024 // 8 GB — umbral de archivado

const FASES = [
  { hasta: 12, label: 'Conectando con Drive...' },
  { hasta: 30, label: 'Leyendo archivos en nube...' },
  { hasta: 65, label: 'Moviendo archivos a Drive...' },
  { hasta: 82, label: 'Limpiando almacenamiento R2...' },
  { hasta: 94, label: 'Verificando transferencia...' },
  { hasta: 99, label: 'Finalizando...' },
]

function faseLabel(pct: number): string {
  return FASES.find((f) => pct <= f.hasta)?.label ?? 'Procesando...'
}

// ─── Rueda SVG ────────────────────────────────────────────────────────────────
type CircleStatus = 'progress' | 'ok' | 'warn' | 'error'

function CircleProgress({
  pct, size = 120, status = 'progress',
}: { pct: number; size?: number; status?: CircleStatus }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  const strokeColor =
    status === 'ok'    ? '#22c55e' :
    status === 'warn'  ? '#f59e0b' :
    status === 'error' ? '#ef4444' :
    pct > 80           ? '#f59e0b' : '#3b82f6'

  const textColor =
    status === 'ok'    ? '#16a34a' :
    status === 'warn'  ? '#b45309' :
    status === 'error' ? '#dc2626' : '#111827'

  const subLabel =
    status === 'ok'    ? '✓ Listo'    :
    status === 'warn'  ? '⚠ Parcial'  :
    status === 'error' ? '✗ Error'    : ''

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={strokeColor} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.35s ease, stroke 0.3s ease' }}
      />
      <text x="50%" y={subLabel ? '44%' : '50%'} dominantBaseline="middle" textAnchor="middle"
        fontSize={size * 0.24} fontWeight="800" fill={textColor}>
        {pct}%
      </text>
      {subLabel && (
        <text x="50%" y="66%" dominantBaseline="middle" textAnchor="middle"
          fontSize={size * 0.13} fill={textColor} fontWeight="600">
          {subLabel}
        </text>
      )}
    </svg>
  )
}

// ─── Barra de almacenamiento ──────────────────────────────────────────────────
function StorageBar({ bytes }: { bytes: number }) {
  const pct = Math.min((bytes / LIMITE_BYTES) * 100, 100)
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="space-y-1">
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{formatBytes(bytes)} usados</span>
        <span>{formatBytes(LIMITE_BYTES)} límite</span>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function StoragePage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [oauthMsg, setOauthMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

  // Estado de archivado por tenant
  const [archivandoId, setArchivandoId] = useState<string | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Mensajes de vuelta del OAuth callback
  useEffect(() => {
    const ok  = searchParams.get('drive_ok')
    const err = searchParams.get('drive_error')
    if (ok) {
      setOauthMsg({ tipo: 'ok', texto: '¡Google Drive conectado! Ya puedes mover archivos.' })
      // Limpiar URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (err) {
      const msg = err === 'no_refresh_token'
        ? 'Google no devolvió el token de acceso. Revoca el acceso en myaccount.google.com/permissions y vuelve a conectar.'
        : decodeURIComponent(err)
      setOauthMsg({ tipo: 'err', texto: msg })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams])

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('tenants')
      .select('id, nombre, storage_usado_bytes, archivado_drive_habilitado, drive_folder_id, google_refresh_token')
      .order('nombre')
    setTenants((data as Tenant[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Limpia el intervalo al desmontar
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const toggleDrive = async (tenantId: string, habilitado: boolean) => {
    await supabase.from('tenants').update({ archivado_drive_habilitado: !habilitado }).eq('id', tenantId)
    await cargar()
  }

  const liberarEspacio = async (tenantId: string) => {
    setArchivandoId(tenantId)
    setProgreso(0)
    setResultado(null)
    setErrorMsg('')

    // Rueda: avanza rápido al inicio, más lento al acercarse a 95%
    let p = 0
    intervalRef.current = setInterval(() => {
      p += Math.random() * (p < 40 ? 4 : p < 70 ? 2 : 0.5)
      if (p >= 95) { clearInterval(intervalRef.current!); p = 95 }
      setProgreso(Math.round(p))
    }, 280)

    try {
      const res = await fetch('/api/archival', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, force: true }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Error en el servidor')

      clearInterval(intervalRef.current!)
      setProgreso(100)
      setResultado({
        archivados: data.archivados ?? 0,
        mbLiberados: Math.round((data.bytesLiberados ?? 0) / 1024 / 1024),
        errores: data.errores ?? [],
      })

      // Refrescar storage tras completar
      await cargar()
    } catch (err: unknown) {
      clearInterval(intervalRef.current!)
      setProgreso(0)
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setArchivandoId(null)
    }
  }

  const resetEstado = () => {
    setProgreso(0)
    setResultado(null)
    setErrorMsg('')
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        {[1, 2].map((k) => (
          <div key={k} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse space-y-3">
            <div className="h-5 w-32 bg-gray-200 rounded" />
            <div className="h-2.5 w-full bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Storage</h1>
        <p className="text-sm text-gray-500 mt-1">
          Límite R2 gratuito: 10 GB · Archivado automático a Drive al llegar a 8 GB.
        </p>
      </div>

      {/* Banner OAuth */}
      {oauthMsg && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
          oauthMsg.tipo === 'ok'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span className="text-lg leading-none">{oauthMsg.tipo === 'ok' ? '✓' : '✗'}</span>
          <span className="flex-1">{oauthMsg.texto}</span>
          <button onClick={() => setOauthMsg(null)} className="text-gray-400 hover:text-gray-600 ml-2">✕</button>
        </div>
      )}

      {tenants.map((t) => {
        const enAlerta = t.storage_usado_bytes > ALERTA_BYTES
        const esteArchivando = archivandoId === t.id
        // Conectado si tiene carpeta compartida (service account) o token OAuth
        const driveConectado = !!(t.drive_folder_id || t.google_refresh_token)
        const driveOk = driveConectado

        return (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Cabecera empresa */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900 text-lg">{t.nombre}</p>
                  <p className={`text-sm mt-0.5 ${enAlerta ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {enAlerta ? '⚠ Cerca del límite — ' : ''}{formatBytes(t.storage_usado_bytes)} en nube
                  </p>
                </div>
                {/* Toggle auto-archivado */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleDrive(t.id, t.archivado_drive_habilitado)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      t.archivado_drive_habilitado ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      t.archivado_drive_habilitado ? 'translate-x-5' : ''
                    }`} />
                  </button>
                  <span className="text-xs text-gray-400">Auto Drive</span>
                </div>
              </div>
              <div className="mt-3">
                <StorageBar bytes={t.storage_usado_bytes} />
              </div>
              {t.archivado_drive_habilitado && !driveOk && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠ Configura la carpeta de Drive en Empresas → Configurar
                </p>
              )}
            </div>

            {/* ── Sección liberar espacio ── */}
            <div className="px-5 py-5">
              {/* Estado normal */}
              {!esteArchivando && progreso === 0 && !resultado && !errorMsg && (
                <div className="space-y-3">
                  {/* Estado conexión Drive */}
                  <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${driveConectado ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs font-medium text-gray-700">Google Drive</span>
                      {driveConectado ? (
                        <span className="text-xs text-green-600 font-semibold">
                          {t.google_refresh_token ? 'Conectado · OAuth' : 'Conectado · Carpeta compartida'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Sin carpeta configurada</span>
                      )}
                    </div>
                    {!driveConectado && (
                      <span className="text-xs text-amber-600 font-medium">
                        Configura en Empresas → Editar
                      </span>
                    )}
                  </div>

                  {/* Botón liberar espacio */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Liberar espacio en nube</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Mueve los archivos más antiguos a Drive y borra copias de R2
                      </p>
                    </div>
                    <button
                      onClick={() => liberarEspacio(t.id)}
                      disabled={!driveOk}
                      title={!driveOk ? 'Configura la carpeta de Drive en Empresas → Editar' : undefined}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        driveOk
                          ? 'bg-blue-700 text-white hover:bg-blue-800 active:scale-95 shadow-sm hover:shadow-md'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Mover a Drive
                    </button>
                  </div>
                </div>
              )}

              {/* En progreso: rueda animada */}
              {esteArchivando && (
                <div className="flex flex-col items-center py-4 gap-4">
                  <CircleProgress pct={progreso} size={130} />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-800">{faseLabel(progreso)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      No cierres esta página mientras se transfieren los archivos
                    </p>
                  </div>
                  {/* Barra secundaria animada */}
                  <div className="w-full max-w-xs">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Completado: resultados */}
              {!esteArchivando && progreso === 100 && resultado && (() => {
                const { archivados, mbLiberados, errores } = resultado
                const todoBien  = archivados > 0 && errores.length === 0
                const parcial   = archivados > 0 && errores.length > 0
                const todoFallo = archivados === 0 && errores.length > 0
                const nadaQHacer = archivados === 0 && errores.length === 0

                const status: CircleStatus =
                  todoBien   ? 'ok' :
                  parcial    ? 'warn' :
                  todoFallo  ? 'error' : 'ok'

                return (
                  <div className="flex flex-col items-center py-3 gap-4">
                    <CircleProgress pct={100} size={110} status={status} />

                    {/* ── Éxito total ── */}
                    {(todoBien || parcial) && (
                      <div className={`w-full rounded-xl p-4 space-y-3 border ${
                        todoBien ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                      }`}>
                        <p className={`text-sm font-bold text-center ${todoBien ? 'text-green-800' : 'text-amber-800'}`}>
                          {todoBien ? 'Transferencia completada' : 'Transferencia parcial'}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className={`bg-white rounded-lg p-3 text-center border ${todoBien ? 'border-green-100' : 'border-amber-100'}`}>
                            <p className={`text-2xl font-black ${todoBien ? 'text-green-700' : 'text-amber-700'}`}>{archivados}</p>
                            <p className="text-xs text-gray-500 mt-0.5">archivo{archivados !== 1 ? 's' : ''} a Drive</p>
                          </div>
                          <div className={`bg-white rounded-lg p-3 text-center border ${todoBien ? 'border-green-100' : 'border-amber-100'}`}>
                            <p className="text-2xl font-black text-blue-700">{mbLiberados}</p>
                            <p className="text-xs text-gray-500 mt-0.5">MB liberados de R2</p>
                          </div>
                        </div>
                        {parcial && (
                          <details className="text-xs">
                            <summary className="text-amber-700 cursor-pointer font-medium">
                              {errores.length} archivo{errores.length !== 1 ? 's' : ''} no se transfirieron — ver detalle
                            </summary>
                            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                              {errores.slice(0, 10).map((e, i) => (
                                <p key={i} className="text-amber-600 font-mono text-[10px] bg-amber-100 rounded px-2 py-0.5 break-all">{e}</p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    {/* ── Todo falló ── */}
                    {todoFallo && (
                      <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-bold text-red-800 text-center">
                          No se pudo transferir ningún archivo
                        </p>
                        <p className="text-xs text-red-700 text-center">
                          Revisa que la carpeta de Drive esté compartida con la cuenta de servicio,
                          y que <code className="bg-red-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code> esté configurada en el servidor.
                        </p>
                        <details className="text-xs">
                          <summary className="text-red-600 cursor-pointer font-medium">
                            Ver {errores.length} error{errores.length !== 1 ? 'es' : ''} técnicos
                          </summary>
                          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                            {errores.slice(0, 15).map((e, i) => (
                              <p key={i} className="text-red-600 font-mono text-[10px] bg-red-100 rounded px-2 py-0.5 break-all">{e}</p>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}

                    {/* ── Nada que hacer ── */}
                    {nadaQHacer && (
                      <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm font-medium text-gray-700">Sin archivos que mover</p>
                        <p className="text-xs text-gray-400 mt-1">
                          El almacenamiento está dentro del límite de 8 GB
                        </p>
                      </div>
                    )}

                    <button onClick={resetEstado} className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Cerrar
                    </button>
                  </div>
                )
              })()}

              {/* Error */}
              {!esteArchivando && errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-red-700 mb-1">Error al archivar</p>
                  <p className="text-xs text-red-600">{errorMsg}</p>
                  <button
                    onClick={resetEstado}
                    className="mt-3 text-xs text-red-500 hover:text-red-700 underline"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {tenants.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">Sin empresas registradas</div>
      )}
    </div>
  )
}
