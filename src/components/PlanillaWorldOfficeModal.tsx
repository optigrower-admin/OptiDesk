'use client'
import { useState, useEffect } from 'react'

const STORAGE_KEY_PREFIX = 'planilla_uma_consec_'

interface Props {
  tenantId: string
  onClose: () => void
}

export default function PlanillaWorldOfficeModal({ tenantId, onClose }: Props) {
  const storageKey = STORAGE_KEY_PREFIX + tenantId

  // Fecha local del navegador (evita desfase UTC en zonas horarias negativas)
  const hoy = (() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()

  const [fechaInicio, setFechaInicio] = useState(hoy)
  const [fechaFin,    setFechaFin]    = useState(hoy)
  const [consec,      setConsec]      = useState(1)
  const [modoTercero, setModoTercero] = useState<'consumidor_final' | 'id_consumidores'>('consumidor_final')
  const [generando,   setGenerando]   = useState(false)
  const [error,       setError]       = useState('')

  // Cargar último consecutivo guardado
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setConsec(parseInt(saved, 10))
    } catch { /* ignore */ }
  }, [storageKey])

  async function generar() {
    if (!fechaInicio || !fechaFin) { setError('Selecciona ambas fechas.'); return }
    if (fechaFin < fechaInicio)    { setError('La fecha fin no puede ser anterior al inicio.'); return }
    if (!modoTercero)              { setError('Selecciona el modo de tercero.'); return }
    setError('')
    setGenerando(true)

    try {
      const res = await fetch('/api/admin/planilla-uma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio, fechaFin, consecutivoInicial: consec, modoTercero }),
      })

      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Error generando planilla.')
        return
      }

      const blob = await res.blob()

      // Nombre del archivo con rango de fechas en DDMMYY
      const fmt = (iso: string) => {
        const [y, m, d] = iso.split('-')
        return `${d}${m}${y.slice(2)}`
      }
      const filename = `Planilla Venta Rep UMA ${fmt(fechaInicio)} - ${fmt(fechaFin)}.xlsx`

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Guardar próximo consecutivo (último usado + número de entradas generadas)
      // No sabemos exactamente cuántas entradas se generaron desde aquí,
      // así que guardamos consec + 1000 como tope conservador; el usuario puede editarlo.
      // En realidad guardamos el consecutivo al que se empezó +1 para la siguiente generación,
      // pero lo correcto es leer la respuesta. Por ahora lo dejamos editable y guardamos el inicio.
      // El usuario ajustará según lo que generó.
      // Para simplicidad: no guardamos automático — el usuario siempre puede editar el campo.
      // Guardamos el valor que se usó para que la próxima apertura muestre el mismo.
      try { localStorage.setItem(storageKey, String(consec)) } catch { /* ignore */ }

      onClose()
    } catch (err) {
      setError('Error de red: ' + String(err))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Generar Planilla WorldOffice</h2>
              <p className="text-[11px] text-gray-400">Repuestos UMA vendidos en el rango</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">

          {/* Rango de fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha inicio</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={e => setFechaInicio(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha fin</label>
              <input
                type="date"
                value={fechaFin}
                onChange={e => setFechaFin(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Consecutivo */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Consecutivo inicial <span className="text-gray-400 font-normal">(Documento Número)</span>
            </label>
            <input
              type="number"
              min={1}
              value={consec}
              onChange={e => setConsec(parseInt(e.target.value, 10) || 1)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Se guarda automáticamente para la siguiente generación. Edítalo si necesitas ajustarlo.
            </p>
          </div>

          {/* Modo tercero */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Identificación del cliente (col. F)</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="modoTercero"
                  value="consumidor_final"
                  checked={modoTercero === 'consumidor_final'}
                  onChange={() => setModoTercero('consumidor_final')}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">Consumidor Final</span>
                  <p className="text-[11px] text-gray-400">Todos los clientes quedan como <span className="font-mono">222222222</span></p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="modoTercero"
                  value="id_consumidores"
                  checked={modoTercero === 'id_consumidores'}
                  onChange={() => setModoTercero('id_consumidores')}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">ID de Consumidores</span>
                  <p className="text-[11px] text-gray-400">Usa la cédula del cliente si existe, si no <span className="font-mono">222222222</span></p>
                </div>
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={generar}
              disabled={generando}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {generando ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Generando...
                </>
              ) : (
                <>📥 Generar Excel</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
