'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'

interface Props {
  clienteId: string
  tenantId: string
  clienteNombre?: string
  clienteCelular?: string
}

type MotoCat = {
  id: string
  referencia: string
  precio: number
  costo_documentos: number
  costo_prenda: number
  tagline_venta: string
  cilindraje: string
  potencia: string
  frenos: string
  combustible: string
  rendimiento: string
  velocidad_max: string
  garantia: string
  colores: string
  caracteristica: string
  fotos: { tipo: string; r2_key: string }[]
}

type Cotizacion = {
  id: string
  numero: number
  fecha_generacion: string
  vigencia_dias: number
  estado: string
}

function pad(n: number) { return String(n).padStart(4, '0') }

export default function CotizacionTab({ clienteId, tenantId, clienteNombre, clienteCelular }: Props) {
  const supabase = createClient()

  const [catalogo, setCatalogo]             = useState<MotoCat[]>([])
  const [historial, setHistorial]           = useState<Cotizacion[]>([])
  const [motosInteres, setMotosInteres]     = useState<string[]>([])   // IDs de motos de interés del cliente
  const [selected, setSelected]             = useState<string[]>([])
  const [mostrarPrecios, setMostrarPrecios] = useState<Record<string, boolean>>({})
  const [vigencia, setVigencia]             = useState(30)
  const [notas, setNotas]                   = useState('')
  const [nombre, setNombre]                 = useState(clienteNombre ?? '')
  const [celular, setCelular]               = useState(clienteCelular ?? '')
  const [generating, setGenerating]         = useState(false)
  const [loading, setLoading]               = useState(true)
  const [step, setStep]                     = useState<'lista' | 'nueva'>('lista')

  const cargar = useCallback(async () => {
    // Catálogo: base + specs en query separada (robusta si faltan columnas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let motosData: any[] = []

    const { data: motosBase } = await supabase.from('motos_catalogo')
      .select('id, referencia, precio, costo_documentos, costo_prenda')
      .eq('tenant_id', tenantId).eq('activa', true).order('orden')
    motosData = motosBase ?? []

    // Specs (pueden no existir si migration_v61 no corrió)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const specsMap: Record<string, Record<string, any>> = {}
    const { data: specs } = await supabase.from('motos_catalogo')
      .select('id, tagline_venta, cilindraje, potencia, frenos, combustible, rendimiento, velocidad_max, garantia, colores, caracteristica')
      .eq('tenant_id', tenantId).eq('activa', true)
    for (const s of specs ?? []) specsMap[s.id] = s

    // Fotos (tabla puede no existir aún)
    const fotosMap: Record<string, { tipo: string; r2_key: string }[]> = {}
    if (motosData.length > 0) {
      const { data: fotos } = await supabase.from('motos_catalogo_fotos')
        .select('moto_catalogo_id, tipo, r2_key')
        .in('moto_catalogo_id', motosData.map(m => m.id))
      for (const f of fotos ?? []) {
        if (!fotosMap[f.moto_catalogo_id]) fotosMap[f.moto_catalogo_id] = []
        fotosMap[f.moto_catalogo_id].push({ tipo: f.tipo, r2_key: f.r2_key })
      }
    }

    setCatalogo(motosData.map(m => {
      const s = specsMap[m.id] ?? {}
      return {
        id: m.id, referencia: m.referencia,
        precio: m.precio ?? 0, costo_documentos: m.costo_documentos ?? 0, costo_prenda: m.costo_prenda ?? 0,
        tagline_venta: s.tagline_venta ?? '', cilindraje: s.cilindraje ?? '',
        potencia: s.potencia ?? '', frenos: s.frenos ?? '', combustible: s.combustible ?? '',
        rendimiento: s.rendimiento ?? '', velocidad_max: s.velocidad_max ?? '',
        garantia: s.garantia ?? '', colores: s.colores ?? '', caracteristica: s.caracteristica ?? '',
        fotos: fotosMap[m.id] ?? [],
      } as MotoCat
    }))

    // Motos de interés del cliente (para pre-selección)
    const { data: interes } = await supabase.from('clientes_motos_interes')
      .select('moto_catalogo_id').eq('cliente_id', clienteId)
    setMotosInteres((interes ?? []).map(i => i.moto_catalogo_id))

    // Historial de cotizaciones
    const hist = await fetch(`/api/cotizaciones?cliente_id=${clienteId}`).then(r => r.json()).catch(() => [])
    setHistorial(hist ?? [])

    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  function abrirNueva() {
    // Pre-seleccionar motos de interés (hasta 3)
    const presel = motosInteres
      .filter(id => catalogo.some(c => c.id === id))
      .slice(0, 3)
    setSelected(presel)
    setStep('nueva')
  }

  function toggleSelect(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length >= 3 ? prev
        : [...prev, id]
    )
  }

  async function generar() {
    if (selected.length === 0) return
    setGenerating(true)
    try {
      const opciones = selected.map(id => {
        const m = catalogo.find(c => c.id === id)!
        return {
          moto_catalogo_id: m.id,
          referencia:       m.referencia,
          tagline_venta:    m.tagline_venta,
          cilindraje:       m.cilindraje,
          potencia:         m.potencia,
          frenos:           m.frenos,
          combustible:      m.combustible,
          rendimiento:      m.rendimiento,
          velocidad_max:    m.velocidad_max,
          garantia:         m.garantia,
          colores:          m.colores,
          caracteristica:   m.caracteristica,
          foto_frente_key:  m.fotos.find(f => f.tipo === 'frente')?.r2_key ?? null,
          foto_lado_key:    m.fotos.find(f => f.tipo === 'lado')?.r2_key ?? null,
          foto_promo_key:   m.fotos.find(f => f.tipo === 'promocional')?.r2_key ?? null,
          precio:           m.precio,
          costo_documentos: m.costo_documentos,
          mostrar_precio:   mostrarPrecios[id] ?? false,
        }
      })

      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:      clienteId,
          cliente_nombre:  nombre || null,
          cliente_celular: celular || null,
          opciones, notas: notas || null, vigencia_dias: vigencia,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Error ${res.status} al crear la cotización`)
      }
      const json = await res.json() as { id?: string }
      if (!json.id) throw new Error('La API no devolvió un ID de cotización')
      window.open(`/admin/cotizaciones/${json.id}`, '_blank')
      setStep('lista')
      setSelected([])
      setNotas('')
      cargar()
    } catch (e) {
      alert('No se pudo generar la cotización: ' + (e instanceof Error ? e.message : 'Error desconocido'))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  /* ── PASO: NUEVA COTIZACIÓN ── */
  if (step === 'nueva') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nueva cotización</p>
        <button onClick={() => { setStep('lista'); setSelected([]) }} className="text-xs text-gray-400 hover:text-gray-700">✕ Cancelar</button>
      </div>

      {/* Motos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">Selecciona hasta 3 motos</p>
          {motosInteres.length > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              ✓ {Math.min(motosInteres.length, 3)} moto{motosInteres.length !== 1 ? 's' : ''} de interés pre-seleccionadas
            </span>
          )}
        </div>

        <div className="space-y-2">
          {catalogo.map(m => {
            const sel      = selected.includes(m.id)
            const disabled = !sel && selected.length >= 3
            const esInteres = motosInteres.includes(m.id)
            const conPapeles = m.precio + m.costo_documentos
            const pignorada  = conPapeles + m.costo_prenda

            return (
              <button key={m.id} onClick={() => toggleSelect(m.id)} disabled={disabled}
                className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                  sel      ? 'border-blue-600 bg-blue-50' :
                  disabled ? 'border-gray-100 bg-gray-50 opacity-40' :
                  esInteres ? 'border-blue-200 bg-blue-50/40 hover:border-blue-400' :
                  'border-gray-200 hover:border-blue-300'
                }`}>

                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                    {sel && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{m.referencia}</span>
                      {esInteres && (
                        <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-semibold">⭐ Interés</span>
                      )}
                      {m.fotos.length === 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Sin foto</span>
                      )}
                    </div>

                    {/* Specs */}
                    {(m.cilindraje || m.potencia || m.frenos) && (
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {m.cilindraje && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">⚙️ {m.cilindraje}</span>}
                        {m.potencia   && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">⚡ {m.potencia}</span>}
                        {m.frenos     && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">🛡️ {m.frenos}</span>}
                      </div>
                    )}

                    {/* Precios */}
                    <div className="flex gap-3 mt-1.5 flex-wrap">
                      <div className="text-right">
                        <div className="text-[9px] text-gray-400 uppercase tracking-wide">Sin papeles</div>
                        <div className="text-xs font-semibold text-gray-600">{formatCOP(m.precio)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-emerald-600 uppercase tracking-wide font-semibold">Con papeles</div>
                        <div className="text-sm font-bold text-emerald-700">{formatCOP(conPapeles)}</div>
                      </div>
                      {m.costo_prenda > 0 && (
                        <div className="text-right">
                          <div className="text-[9px] text-blue-500 uppercase tracking-wide font-semibold">Pignorada</div>
                          <div className="text-xs font-semibold text-blue-700">{formatCOP(pignorada)}</div>
                        </div>
                      )}
                    </div>

                    {/* Toggle precio en cotización */}
                    {sel && (
                      <label className="flex items-center gap-1.5 mt-2 cursor-pointer" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={mostrarPrecios[m.id] ?? false}
                          onChange={e => setMostrarPrecios(p => ({ ...p, [m.id]: e.target.checked }))}
                          className="rounded border-gray-300 text-blue-600" />
                        <span className="text-xs text-gray-600">Mostrar precio en la cotización</span>
                      </label>
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {catalogo.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-xl">
              Sin motos en el catálogo. Agrégalas en <strong>Config Ventas</strong>.
            </p>
          )}
        </div>
      </div>

      {/* Datos del cliente */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos del cliente</p>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={celular} onChange={e => setCelular(e.target.value)} placeholder="Celular"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Vigencia */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Vigencia de la cotización (días)</label>
        <input type="number" min={1} max={90} value={vigencia} onChange={e => setVigencia(Number(e.target.value))}
          className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Notas */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Notas adicionales (opcional)</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
          placeholder="Ej: Oferta especial válida hasta fin de mes. Descuento en kit de accesorios..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      <button onClick={generar} disabled={selected.length === 0 || generating}
        className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
        {generating
          ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generando...</>
          : <><span>📄</span> Generar cotización ({selected.length} moto{selected.length !== 1 ? 's' : ''})</>
        }
      </button>
    </div>
  )

  /* ── HISTORIAL ── */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cotizaciones</p>
        <button onClick={abrirNueva}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors">
          + Nueva cotización
        </button>
      </div>

      {motosInteres.length > 0 && historial.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs text-blue-700">
          <span>⭐</span>
          <span>Este cliente tiene <strong>{motosInteres.length}</strong> moto{motosInteres.length !== 1 ? 's' : ''} de interés — se pre-seleccionarán al crear la cotización.</span>
        </div>
      )}

      {historial.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm font-medium text-gray-500">Sin cotizaciones aún</p>
          <p className="text-xs mt-1">Genera la primera para este cliente</p>
        </div>
      ) : (
        <div className="space-y-2">
          {historial.map(c => (
            <a key={c.id} href={`/admin/cotizaciones/${c.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between border border-gray-200 rounded-xl p-3 hover:border-blue-300 hover:bg-blue-50 transition-all group">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900">Cot. #{pad(c.numero)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    c.estado === 'aceptada'  ? 'bg-green-100 text-green-700' :
                    c.estado === 'rechazada' ? 'bg-red-100 text-red-600' :
                    c.estado === 'enviada'   ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{c.estado}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(c.fecha_generacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}vigencia {c.vigencia_dias} días
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
