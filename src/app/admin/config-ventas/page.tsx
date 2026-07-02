'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/ventas/pipeline'

/* ─── Tipos ─────────────────────────────────────────── */
interface Entidad { id: string; nombre: string; activa: boolean }

interface MotoCat {
  id: string
  referencia: string
  precio: number
  costo_documentos: number
  costo_prenda: number
  activa: boolean
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
  cotizacion_beneficios: string
  fotos: { tipo: string; r2_key: string }[]
}

interface CotizacionInfo {
  tagline: string
  direccion: string
  telefono1: string
  telefono2: string
  email: string
  web: string
  whatsapp: string
  instagram: string
  facebook: string
  tiktok: string
  incluye: string
  recargoTarjeta: number
}

interface TipoRecordatorio { id: string; tipo: string; activo: boolean; dias_umbral: number }
interface Plantilla { id: string; nombre: string; asunto: string; cuerpo_html: string; activa: boolean }

const TIPO_LABEL: Record<string, string> = {
  credito_sin_iniciar: 'Estudio de crédito sin iniciar',
  entrega_moto_pendiente: 'Entrega de moto pendiente',
  cliente_sin_movimiento: 'Cliente sin movimiento',
}

const FOTO_TIPOS = [
  { tipo: 'frente',      label: 'Frente',       hint: 'Foto frontal, fondo transparente (PNG)' },
  { tipo: 'lado',        label: 'Lado',          hint: 'Foto lateral, fondo transparente (PNG)' },
  { tipo: 'promocional', label: 'Promocional',   hint: 'Foto en carretera o estudio' },
  { tipo: 'extra',       label: 'Extra',         hint: '4ta foto adicional del producto' },
] as const

function ToggleSwitch({ activo, onChange }: { activo: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${activo ? 'bg-green-500' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${activo ? 'translate-x-4' : ''}`} />
    </button>
  )
}

/* ─── Componente de foto individual ─────────────────── */
function FotoSlot({ motoId, tipo, label, hint, rKey, onUploaded }: {
  motoId: string; tipo: string; label: string; hint: string
  rKey?: string; onUploaded: (key: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(rKey ? `/api/catalogo-fotos/view?key=${rKey}` : '')

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const presignRes = await fetch('/api/catalogo-fotos/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moto_catalogo_id: motoId, tipo, content_type: file.type }),
      })
      const { url, key } = await presignRes.json()
      await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      await fetch('/api/catalogo-fotos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moto_catalogo_id: motoId, tipo, r2_key: key }),
      })
      setPreviewUrl(URL.createObjectURL(file))
      onUploaded(key)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className={`relative w-24 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-all flex items-center justify-center overflow-hidden
          ${previewUrl ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'}`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-contain p-1" onError={() => setPreviewUrl('')} />
        ) : (
          <div className="text-center">
            {uploading
              ? <svg className="w-6 h-6 animate-spin text-blue-500 mx-auto" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              : <svg className="w-6 h-6 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            }
          </div>
        )}
        {previewUrl && !uploading && (
          <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center">
            <span className="text-white text-xs font-semibold opacity-0 hover:opacity-100 transition-opacity">Cambiar</span>
          </div>
        )}
      </div>
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <span className="text-[10px] text-gray-400 text-center leading-tight" style={{ maxWidth: 96 }}>{hint}</span>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  )
}

/* ─── Tarjeta expandible por moto ───────────────────── */
function MotoCard({ m, recargoTarjeta, onSave, onToggle, onDelete }: {
  m: MotoCat
  recargoTarjeta: number
  onSave:   (id: string, campos: Partial<MotoCat>) => void
  onToggle: (id: string, activa: boolean) => void
  onDelete: (id: string, referencia: string) => void
}) {
  const [open, setOpen]     = useState(false)
  const [local, setLocal]   = useState(m)
  const [saving, setSaving] = useState(false)
  const [fotos, setFotos]   = useState(m.fotos)

  const conPapeles         = local.precio + local.costo_documentos
  const conPrenda          = conPapeles + local.costo_prenda
  const conTarjetaPapeles  = Math.round(conPapeles * (1 + recargoTarjeta / 100))
  const conTarjetaPrenda   = Math.round(conPrenda  * (1 + recargoTarjeta / 100))

  function campo(k: keyof MotoCat) {
    return (
      <input value={String(local[k] ?? '')} onChange={e => setLocal(p => ({ ...p, [k]: e.target.value }))}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    )
  }

  async function guardar() {
    setSaving(true)
    await onSave(m.id, {
      precio: local.precio, costo_documentos: local.costo_documentos, costo_prenda: local.costo_prenda,
      tagline_venta: local.tagline_venta, cilindraje: local.cilindraje, potencia: local.potencia,
      frenos: local.frenos, combustible: local.combustible, rendimiento: local.rendimiento,
      velocidad_max: local.velocidad_max, garantia: local.garantia, colores: local.colores,
      caracteristica: local.caracteristica, cotizacion_beneficios: local.cotizacion_beneficios,
    })
    setSaving(false)
  }

  return (
    <div className={`rounded-xl border transition-all ${m.activa ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>

      {/* ── CABECERA — siempre visible ── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left min-w-0">
            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            <span className="font-bold text-sm text-gray-900 truncate">{m.referencia}</span>
            {fotos.length > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{fotos.length} foto{fotos.length > 1 ? 's' : ''}</span>}
            {m.cilindraje && <span className="text-xs text-gray-400 flex-shrink-0">{m.cilindraje}</span>}
          </button>
          <ToggleSwitch activo={m.activa} onChange={() => onToggle(m.id, m.activa)} />
        </div>

        {/* 5 variantes de precio — siempre visibles */}
        <div className="grid grid-cols-5 gap-1.5">
          <div className="bg-gray-50 rounded-lg px-2 py-2">
            <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide leading-tight">Sin papeles</div>
            <div className="text-xs font-bold text-gray-800 mt-0.5">{formatCOP(local.precio)}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg px-2 py-2">
            <div className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wide leading-tight">Con papeles</div>
            <div className="text-xs font-bold text-emerald-700 mt-0.5">{formatCOP(conPapeles)}</div>
          </div>
          <div className="bg-blue-50 rounded-lg px-2 py-2">
            <div className="text-[9px] text-blue-500 font-semibold uppercase tracking-wide leading-tight">Pignorada</div>
            <div className="text-xs font-bold text-blue-700 mt-0.5">{formatCOP(conPrenda)}</div>
          </div>
          <div className="bg-amber-50 rounded-lg px-2 py-2">
            <div className="text-[9px] text-amber-600 font-semibold uppercase tracking-wide leading-tight">Tarjeta c/papeles +{recargoTarjeta}%</div>
            <div className="text-xs font-bold text-amber-700 mt-0.5">{formatCOP(conTarjetaPapeles)}</div>
          </div>
          <div className="bg-orange-50 rounded-lg px-2 py-2">
            <div className="text-[9px] text-orange-600 font-semibold uppercase tracking-wide leading-tight">Tarjeta pignorada +{recargoTarjeta}%</div>
            <div className="text-xs font-bold text-orange-700 mt-0.5">{formatCOP(conTarjetaPrenda)}</div>
          </div>
        </div>
      </div>

      {/* ── EXPANDIDO ── */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-5">

          {/* Fotos */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fotos de la moto</p>
            <div className="flex gap-6 flex-wrap">
              {FOTO_TIPOS.map(ft => (
                <FotoSlot key={ft.tipo} motoId={m.id} tipo={ft.tipo} label={ft.label} hint={ft.hint}
                  rKey={fotos.find(f => f.tipo === ft.tipo)?.r2_key}
                  onUploaded={key => setFotos(prev => {
                    const next = prev.filter(f => f.tipo !== ft.tipo)
                    return [...next, { tipo: ft.tipo, r2_key: key }]
                  })}
                />
              ))}
            </div>
          </div>

          {/* Precios editables */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Precios base</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Precio sin papeles</label>
                <input type="number" value={local.precio}
                  onChange={e => setLocal(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[10px] text-gray-400 mt-0.5">Solo la moto, sin trámites</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Costo papeles (SOAT + matrícula)</label>
                <input type="number" value={local.costo_documentos}
                  onChange={e => setLocal(p => ({ ...p, costo_documentos: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[10px] text-gray-400 mt-0.5">Se suma al precio base</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Costo pignoración (crédito)</label>
                <input type="number" value={local.costo_prenda}
                  onChange={e => setLocal(p => ({ ...p, costo_prenda: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[10px] text-gray-400 mt-0.5">Aplica en crédito con prenda</p>
              </div>
              <div className="bg-amber-50 rounded-lg px-3 py-2 flex flex-col justify-center gap-1">
                <div>
                  <div className="text-[10px] text-amber-600 font-semibold">Tarjeta sobre papeles (+{recargoTarjeta}%)</div>
                  <div className="text-sm font-bold text-amber-700">{formatCOP(conTarjetaPapeles)}</div>
                </div>
                <div className="border-t border-amber-200 pt-1">
                  <div className="text-[10px] text-orange-600 font-semibold">Tarjeta sobre pignorada (+{recargoTarjeta}%)</div>
                  <div className="text-sm font-bold text-orange-700">{formatCOP(conTarjetaPrenda)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Specs */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ficha técnica y cotización</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tagline de venta</label>
                {campo('tagline_venta')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500 block mb-1">Cilindraje</label>{campo('cilindraje')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Potencia</label>{campo('potencia')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Sistema de frenos</label>{campo('frenos')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Combustible</label>{campo('combustible')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Rendimiento</label>{campo('rendimiento')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Velocidad máx.</label>{campo('velocidad_max')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Garantía</label>{campo('garantia')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">Característica especial</label>{campo('caracteristica')}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Colores disponibles</label>
                {campo('colores')}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Beneficios de venta <span className="text-gray-400">(uno por línea: emoji Título|Descripción)</span>
              </label>
              <textarea
                value={local.cotizacion_beneficios ?? ''}
                onChange={e => setLocal(p => ({ ...p, cotizacion_beneficios: e.target.value }))}
                rows={5}
                placeholder={'🚀 Movilidad sin límites|Llega a tiempo y ahorra tiempo\n💰 Inversión inteligente|Ahorra hasta 4x en combustible\n🛡️ Tranquilidad garantizada|Garantía de fábrica incluida'}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">Si está vacío, se usan los beneficios predeterminados del sistema.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <button onClick={guardar} disabled={saving}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Guardando...' : '✓ Guardar cambios'}
            </button>
            <button onClick={() => onDelete(m.id, m.referencia)}
              className="px-3 py-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors">
              🗑 Eliminar moto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Valores vacíos para nueva moto ─── */
const NUEVA_MOTO_VACIA: Omit<MotoCat, 'id' | 'activa' | 'fotos'> = {
  referencia: '', precio: 0, costo_documentos: 0, costo_prenda: 0,
  tagline_venta: '', cilindraje: '', potencia: '', frenos: '', combustible: '',
  rendimiento: '', velocidad_max: '', garantia: '', colores: '', caracteristica: '',
  cotizacion_beneficios: '',
}

/* ═══════════════════════════════════════════════════════════ */
export default function ConfigVentasPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [entidades, setEntidades]         = useState<Entidad[]>([])
  const [nuevaEntidad, setNuevaEntidad]   = useState('')
  const [motos, setMotos]                 = useState<MotoCat[]>([])
  const [tipos, setTipos]                 = useState<TipoRecordatorio[]>([])
  const [plantillas, setPlantillas]       = useState<Plantilla[]>([])
  const [nuevaPlantilla, setNuevaPlantilla] = useState({ nombre: '', asunto: '', cuerpo_html: '' })
  const [cotInfo, setCotInfo]             = useState<CotizacionInfo>({ tagline: '', direccion: '', telefono1: '', telefono2: '', email: '', web: '', whatsapp: '', instagram: '', facebook: '', tiktok: '', incluye: '', recargoTarjeta: 5 })
  const [savingCotInfo, setSavingCotInfo] = useState(false)
  const [cotInfoOk, setCotInfoOk]         = useState(false)
  const [loading, setLoading]             = useState(true)
  const [showNuevaMoto, setShowNuevaMoto] = useState(false)
  const [nuevaMoto, setNuevaMoto]         = useState<typeof NUEVA_MOTO_VACIA>(NUEVA_MOTO_VACIA)
  const [creandoMoto, setCreandoMoto]     = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return

    const [{ data: ent }, { data: tip }, { data: plant }, { data: ten }] = await Promise.all([
      supabase.from('entidades_financieras').select('id, nombre, activa').eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('tipos_recordatorio_automatico').select('id, tipo, activo, dias_umbral').eq('tenant_id', profile.tenant_id),
      supabase.from('plantillas_correo').select('id, nombre, asunto, cuerpo_html, activa').eq('tenant_id', profile.tenant_id),
      supabase.from('tenants').select('cotizacion_tagline, cotizacion_direccion, cotizacion_telefono1, cotizacion_telefono2, cotizacion_email, cotizacion_web, cotizacion_whatsapp, cotizacion_instagram, cotizacion_facebook, cotizacion_tiktok, cotizacion_incluye, recargo_tarjeta_porcentaje').eq('id', profile.tenant_id).single(),
    ])

    // Cargamos motos en dos pasos para que un fallo en las columnas nuevas
    // (si la migration_v61 no se corrió aún) no oculte las motos existentes.
    const { data: motBase, error: motErr } = await supabase
      .from('motos_catalogo')
      .select('id, referencia, precio, costo_documentos, costo_prenda, activa, tagline_venta, cilindraje, potencia, frenos, combustible, rendimiento, velocidad_max, garantia, colores, caracteristica, cotizacion_beneficios')
      .eq('tenant_id', profile.tenant_id).order('orden')

    // Si la query de columnas nuevas falla (columnas no existen aún), intentamos solo las originales
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mot: any[] = motBase ?? []
    if (motErr || mot.length === 0) {
      const { data: motFallback } = await supabase
        .from('motos_catalogo')
        .select('id, referencia, precio, costo_documentos, costo_prenda, activa')
        .eq('tenant_id', profile.tenant_id).order('orden')
      if (motFallback && mot.length === 0) mot.push(...motFallback)
    }

    // Fotos en query separada — si la tabla no existe aún, simplemente queda vacío
    const { data: fotosAll } = await supabase
      .from('motos_catalogo_fotos')
      .select('moto_catalogo_id, tipo, r2_key')
      .in('moto_catalogo_id', (mot ?? []).map(m => m.id))

    const fotosPorMoto: Record<string, { tipo: string; r2_key: string }[]> = {}
    for (const f of fotosAll ?? []) {
      if (!fotosPorMoto[f.moto_catalogo_id]) fotosPorMoto[f.moto_catalogo_id] = []
      fotosPorMoto[f.moto_catalogo_id].push({ tipo: f.tipo, r2_key: f.r2_key })
    }

    setEntidades((ent ?? []) as Entidad[])
    setMotos((mot ?? []).map(m => ({
      id:            m.id,
      referencia:    m.referencia,
      precio:        m.precio ?? 0,
      costo_documentos: m.costo_documentos ?? 0,
      costo_prenda:  m.costo_prenda ?? 0,
      activa:        m.activa ?? true,
      tagline_venta: (m as never as Record<string,string>).tagline_venta ?? '',
      cilindraje:    (m as never as Record<string,string>).cilindraje    ?? '',
      potencia:      (m as never as Record<string,string>).potencia      ?? '',
      frenos:        (m as never as Record<string,string>).frenos        ?? '',
      combustible:   (m as never as Record<string,string>).combustible   ?? '',
      rendimiento:   (m as never as Record<string,string>).rendimiento   ?? '',
      velocidad_max: (m as never as Record<string,string>).velocidad_max ?? '',
      garantia:      (m as never as Record<string,string>).garantia      ?? '',
      colores:              (m as never as Record<string,string>).colores              ?? '',
      caracteristica:       (m as never as Record<string,string>).caracteristica       ?? '',
      cotizacion_beneficios:(m as never as Record<string,string>).cotizacion_beneficios ?? '',
      fotos:                fotosPorMoto[m.id] ?? [],
    })) as MotoCat[])
    setTipos((tip ?? []) as TipoRecordatorio[])
    setPlantillas((plant ?? []) as Plantilla[])
    if (ten) setCotInfo({
      tagline:        ten.cotizacion_tagline          ?? '',
      direccion:      ten.cotizacion_direccion        ?? '',
      telefono1:      ten.cotizacion_telefono1        ?? '',
      telefono2:      ten.cotizacion_telefono2        ?? '',
      email:          ten.cotizacion_email            ?? '',
      web:            ten.cotizacion_web              ?? '',
      whatsapp:       ten.cotizacion_whatsapp          ?? '',
      instagram:      ten.cotizacion_instagram         ?? '',
      facebook:       ten.cotizacion_facebook          ?? '',
      tiktok:         ten.cotizacion_tiktok            ?? '',
      incluye:        ten.cotizacion_incluye           ?? '',
      recargoTarjeta: ten.recargo_tarjeta_porcentaje   ?? 5,
    })
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!profile?.tenant_id || loading) return
    const faltantes = (Object.keys(TIPO_LABEL) as (keyof typeof TIPO_LABEL)[]).filter(t => !tipos.some(x => x.tipo === t))
    if (faltantes.length === 0) return
    Promise.all(faltantes.map(tipo =>
      supabase.from('tipos_recordatorio_automatico').insert({ tenant_id: profile.tenant_id, tipo, activo: true, dias_umbral: 7 })
    )).then(cargar)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, loading])

  /* ── Entidades ── */
  async function agregarEntidad() {
    if (!nuevaEntidad.trim() || !profile?.tenant_id) return
    await supabase.from('entidades_financieras').insert({ tenant_id: profile.tenant_id, nombre: nuevaEntidad.trim() })
    setNuevaEntidad('')
    cargar()
  }
  async function toggleEntidad(id: string, activa: boolean) {
    await supabase.from('entidades_financieras').update({ activa: !activa }).eq('id', id)
    setEntidades(p => p.map(e => e.id === id ? { ...e, activa: !activa } : e))
  }
  async function eliminarEntidad(id: string) {
    if (!confirm('¿Eliminar esta entidad?')) return
    await supabase.from('entidades_financieras').delete().eq('id', id)
    cargar()
  }

  /* ── Motos ── */
  async function guardarMoto(id: string, cambios: Partial<MotoCat>) {
    await supabase.from('motos_catalogo').update(cambios).eq('id', id)
    setMotos(p => p.map(m => m.id === id ? { ...m, ...cambios } : m))
  }
  async function toggleMoto(id: string, activa: boolean) {
    await supabase.from('motos_catalogo').update({ activa: !activa }).eq('id', id)
    setMotos(p => p.map(m => m.id === id ? { ...m, activa: !activa } : m))
  }
  async function eliminarMoto(id: string, referencia: string) {
    if (!confirm(`¿Eliminar "${referencia}" del catálogo? Se borrarán también sus fotos. Esta acción no se puede deshacer.`)) return
    await supabase.from('motos_catalogo').delete().eq('id', id)
    setMotos(p => p.filter(m => m.id !== id))
  }
  async function crearMoto() {
    if (!nuevaMoto.referencia.trim() || !profile?.tenant_id) return
    setCreandoMoto(true)
    const orden = (motos[motos.length - 1]?.['orden' as keyof MotoCat] as number ?? motos.length) + 1
    const { data, error } = await supabase.from('motos_catalogo').insert({
      tenant_id:        profile.tenant_id,
      referencia:       nuevaMoto.referencia.trim(),
      precio:           nuevaMoto.precio,
      costo_documentos: nuevaMoto.costo_documentos,
      costo_prenda:     nuevaMoto.costo_prenda,
      tagline_venta:    nuevaMoto.tagline_venta   || null,
      cilindraje:       nuevaMoto.cilindraje      || null,
      potencia:         nuevaMoto.potencia        || null,
      frenos:           nuevaMoto.frenos          || null,
      combustible:      nuevaMoto.combustible     || null,
      rendimiento:      nuevaMoto.rendimiento     || null,
      velocidad_max:    nuevaMoto.velocidad_max   || null,
      garantia:         nuevaMoto.garantia        || null,
      colores:          nuevaMoto.colores         || null,
      caracteristica:   nuevaMoto.caracteristica  || null,
      activa:           true,
      orden,
    }).select('id').single()
    setCreandoMoto(false)
    if (error || !data) { alert('No se pudo crear la moto: ' + error?.message); return }
    setMotos(p => [...p, { ...nuevaMoto, id: data.id, activa: true, fotos: [] }])
    setNuevaMoto(NUEVA_MOTO_VACIA)
    setShowNuevaMoto(false)
  }

  /* ── Recordatorios ── */
  async function toggleTipo(id: string, activo: boolean) {
    await supabase.from('tipos_recordatorio_automatico').update({ activo: !activo }).eq('id', id)
    setTipos(p => p.map(t => t.id === id ? { ...t, activo: !activo } : t))
  }
  async function actualizarUmbral(id: string, dias: string) {
    const num = parseInt(dias) || 1
    await supabase.from('tipos_recordatorio_automatico').update({ dias_umbral: num }).eq('id', id)
    setTipos(p => p.map(t => t.id === id ? { ...t, dias_umbral: num } : t))
  }

  /* ── Plantillas ── */
  async function crearPlantilla() {
    if (!nuevaPlantilla.nombre.trim() || !nuevaPlantilla.asunto.trim() || !nuevaPlantilla.cuerpo_html.trim() || !profile?.tenant_id) return
    await supabase.from('plantillas_correo').insert({ tenant_id: profile.tenant_id, ...nuevaPlantilla, created_by: profile.id })
    setNuevaPlantilla({ nombre: '', asunto: '', cuerpo_html: '' })
    cargar()
  }
  async function togglePlantilla(id: string, activa: boolean) {
    await supabase.from('plantillas_correo').update({ activa: !activa }).eq('id', id)
    setPlantillas(p => p.map(pl => pl.id === id ? { ...pl, activa: !activa } : pl))
  }
  async function eliminarPlantilla(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await supabase.from('plantillas_correo').delete().eq('id', id)
    cargar()
  }

  /* ── Info cotización ── */
  async function guardarCotInfo() {
    if (!profile?.tenant_id) return
    setSavingCotInfo(true)
    await supabase.from('tenants').update({
      cotizacion_tagline:          cotInfo.tagline,
      cotizacion_direccion:        cotInfo.direccion,
      cotizacion_telefono1:        cotInfo.telefono1,
      cotizacion_telefono2:        cotInfo.telefono2,
      cotizacion_email:            cotInfo.email,
      cotizacion_web:              cotInfo.web,
      cotizacion_whatsapp:          cotInfo.whatsapp,
      cotizacion_instagram:         cotInfo.instagram,
      cotizacion_facebook:          cotInfo.facebook,
      cotizacion_tiktok:            cotInfo.tiktok,
      cotizacion_incluye:           cotInfo.incluye,
      recargo_tarjeta_porcentaje:   cotInfo.recargoTarjeta,
    }).eq('id', profile.tenant_id)
    setSavingCotInfo(false)
    setCotInfoOk(true)
    setTimeout(() => setCotInfoOk(false), 2500)
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Cargando...</div>

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Config Ventas</h1>
        <p className="text-sm text-gray-500">Catálogos y reglas de Seguimiento Ventas (solo Gerencia)</p>
      </div>

      {/* ── Entidades financieras ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-3">Entidades financieras</h2>
        <div className="space-y-2 mb-3">
          {entidades.map(e => (
            <div key={e.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${!e.activa ? 'opacity-60' : 'border-gray-200'}`}>
              <span className="flex-1 text-sm font-medium text-gray-800">{e.nombre}</span>
              <ToggleSwitch activo={e.activa} onChange={() => toggleEntidad(e.id, e.activa)} />
              <button onClick={() => eliminarEntidad(e.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={nuevaEntidad} onChange={e => setNuevaEntidad(e.target.value)} placeholder="ej: Bancolombia"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={agregarEntidad} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">+ Agregar</button>
        </div>
      </section>

      {/* ── Catálogo de motos ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-base font-bold text-gray-900">Catálogo de motos</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold hidden sm:block">Haz clic para editar</span>
            <a href="/admin/lista-precios" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Lista de precios
            </a>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">Agrega, edita o elimina motos. Las 5 variantes de precio se calculan automáticamente.</p>

        <div className="space-y-2 mb-3">
          {motos.map(m => (
            <MotoCard key={m.id} m={m} recargoTarjeta={cotInfo.recargoTarjeta}
              onSave={guardarMoto} onToggle={toggleMoto} onDelete={eliminarMoto} />
          ))}
          {motos.length === 0 && !showNuevaMoto && (
            <p className="text-sm text-gray-400 text-center py-4">Sin motos en el catálogo. ¡Agrega la primera!</p>
          )}
        </div>

        {/* ── Formulario nueva moto ── */}
        {showNuevaMoto ? (
          <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-blue-800">Nueva moto</span>
              <button onClick={() => { setShowNuevaMoto(false); setNuevaMoto(NUEVA_MOTO_VACIA) }}
                className="text-gray-400 hover:text-gray-700 text-sm">✕ Cancelar</button>
            </div>

            {/* Nombre */}
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre / Referencia *</label>
              <input value={nuevaMoto.referencia} onChange={e => setNuevaMoto(p => ({ ...p, referencia: e.target.value }))}
                placeholder="ej: PULSAR NS 200 FI ABS UG2"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>

            {/* Precios */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Precios</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Precio sin papeles</label>
                  <input type="number" value={nuevaMoto.precio || ''}
                    onChange={e => setNuevaMoto(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Costo papeles (SOAT + mat.)</label>
                  <input type="number" value={nuevaMoto.costo_documentos || ''}
                    onChange={e => setNuevaMoto(p => ({ ...p, costo_documentos: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Costo pignoración (crédito)</label>
                  <input type="number" value={nuevaMoto.costo_prenda || ''}
                    onChange={e => setNuevaMoto(p => ({ ...p, costo_prenda: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* Ficha técnica */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ficha técnica (opcional)</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['tagline_venta',  'Tagline de venta',       'ej: La deportiva ideal para tu aventura'],
                  ['cilindraje',     'Cilindraje',             'ej: 199.5 cc'],
                  ['potencia',       'Potencia',               'ej: 24.5 HP'],
                  ['frenos',         'Sistema de frenos',      'ej: ABS Doble Canal'],
                  ['combustible',    'Sistema combustible',    'ej: Inyección FI'],
                  ['rendimiento',    'Rendimiento',            'ej: 45 km/l'],
                  ['velocidad_max',  'Velocidad máx.',         'ej: 140 km/h'],
                  ['garantia',       'Garantía',               'ej: 2 años / 20,000 km'],
                  ['caracteristica', 'Característica especial','ej: Smart Key, Puerto USB'],
                ] as [keyof typeof NUEVA_MOTO_VACIA, string, string][]).map(([k, label, ph]) => (
                  <div key={k} className={k === 'tagline_venta' || k === 'colores' ? 'col-span-2' : ''}>
                    <label className="text-xs text-gray-500 block mb-1">{label}</label>
                    <input value={nuevaMoto[k] as string}
                      onChange={e => setNuevaMoto(p => ({ ...p, [k]: e.target.value }))}
                      placeholder={ph}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Colores disponibles</label>
                  <input value={nuevaMoto.colores}
                    onChange={e => setNuevaMoto(p => ({ ...p, colores: e.target.value }))}
                    placeholder="ej: Azul Perla, Negro Carbón, Rojo Fuego"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button onClick={crearMoto} disabled={creandoMoto || !nuevaMoto.referencia.trim()}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition-colors">
                {creandoMoto ? 'Creando...' : '+ Agregar al catálogo'}
              </button>
              <span className="text-xs text-gray-400">Después podrás subir las fotos desde la tarjeta</span>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNuevaMoto(true)}
            className="w-full py-3 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 hover:text-blue-800 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Agregar nueva moto
          </button>
        )}
      </section>

      {/* ── Datos del concesionario para cotizaciones ── */}
      <section className="bg-white rounded-xl border border-blue-100 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">📄</span>
          <h2 className="text-base font-bold text-gray-900">Datos del concesionario para cotizaciones</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">Esta información aparece en el encabezado, contacto y pie de cada cotización generada</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Eslogan / Tagline</label>
            <input value={cotInfo.tagline} onChange={e => setCotInfo(p => ({ ...p, tagline: e.target.value }))}
              placeholder="ej: Tu ruta, nuestra pasión."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Dirección</label>
            <input value={cotInfo.direccion} onChange={e => setCotInfo(p => ({ ...p, direccion: e.target.value }))}
              placeholder="ej: Carretera Panamericana Km 38, Coatepec, Veracruz"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Teléfono 1</label>
              <input value={cotInfo.telefono1} onChange={e => setCotInfo(p => ({ ...p, telefono1: e.target.value }))}
                placeholder="+57 300 000 0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Teléfono 2 (opcional)</label>
              <input value={cotInfo.telefono2} onChange={e => setCotInfo(p => ({ ...p, telefono2: e.target.value }))}
                placeholder="+57 310 000 0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Correo electrónico</label>
              <input value={cotInfo.email} onChange={e => setCotInfo(p => ({ ...p, email: e.target.value }))}
                placeholder="ventas@miconcesionario.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Sitio web</label>
              <input value={cotInfo.web} onChange={e => setCotInfo(p => ({ ...p, web: e.target.value }))}
                placeholder="www.miconcesionario.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">WhatsApp (con código de país, sin +)</label>
              <input value={cotInfo.whatsapp} onChange={e => setCotInfo(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="573001234567"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[11px] text-gray-400 mt-1">Ej: 573001234567 (57 = Colombia).</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Recargo pago con tarjeta (%)</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={20} step={0.5} value={cotInfo.recargoTarjeta}
                  onChange={e => setCotInfo(p => ({ ...p, recargoTarjeta: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-sm text-gray-500 font-semibold">%</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Se aplica sobre precio con papeles. Ej: 5 = +5%</p>
            </div>
          </div>
          {/* Ítems "Esta cotización incluye" */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">
              Ítems &ldquo;Esta cotización incluye&rdquo; <span className="text-gray-400 font-normal">(uno por línea)</span>
            </label>
            <textarea
              value={cotInfo.incluye}
              onChange={e => setCotInfo(p => ({ ...p, incluye: e.target.value }))}
              rows={5}
              placeholder={'SOAT obligatorio\nMatrícula + impuestos\nManual del propietario\nGarantía de fábrica\n3 revisiones mano de obra gratis'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">Si está vacío, se usan los ítems predeterminados del sistema.</p>
          </div>

          {/* Redes sociales */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Redes sociales (aparecen en la cotización)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">📸 Instagram</label>
                <input value={cotInfo.instagram} onChange={e => setCotInfo(p => ({ ...p, instagram: e.target.value }))}
                  placeholder="@motospace38"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">👥 Facebook (fan page)</label>
                <input value={cotInfo.facebook} onChange={e => setCotInfo(p => ({ ...p, facebook: e.target.value }))}
                  placeholder="/motospace38"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">🎵 TikTok</label>
                <input value={cotInfo.tiktok} onChange={e => setCotInfo(p => ({ ...p, tiktok: e.target.value }))}
                  placeholder="@motospace38"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={guardarCotInfo} disabled={savingCotInfo}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
              {savingCotInfo ? 'Guardando...' : 'Guardar información'}
            </button>
            {cotInfoOk && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
          </div>
        </div>
      </section>

      {/* ── Recordatorios automáticos ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">Recordatorios automáticos</h2>
        <p className="text-xs text-gray-400 mb-3">Se generan solos para clientes en Seguimiento Ventas que cumplan la condición</p>
        <div className="space-y-2">
          {tipos.map(t => (
            <div key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${!t.activo ? 'opacity-60' : 'border-gray-200'}`}>
              <span className="flex-1 text-sm font-medium text-gray-800">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">después de</span>
                <input type="number" defaultValue={t.dias_umbral} onBlur={e => actualizarUmbral(t.id, e.target.value)}
                  className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-center" />
                <span className="text-xs text-gray-400">días</span>
              </div>
              <ToggleSwitch activo={t.activo} onChange={() => toggleTipo(t.id, t.activo)} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Plantillas de correo ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">Plantillas de correo</h2>
        <p className="text-xs text-gray-400 mb-3">Variable disponible: {'{{nombre_cliente}}'}</p>
        <div className="space-y-2 mb-3">
          {plantillas.map(p => (
            <div key={p.id} className={`rounded-lg border px-3 py-2 ${!p.activa ? 'opacity-60' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-semibold text-gray-800">{p.nombre}</span>
                <ToggleSwitch activo={p.activa} onChange={() => togglePlantilla(p.id, p.activa)} />
                <button onClick={() => eliminarPlantilla(p.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Asunto: {p.asunto}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">Nueva plantilla</p>
          <input value={nuevaPlantilla.nombre} onChange={e => setNuevaPlantilla(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre interno"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={nuevaPlantilla.asunto} onChange={e => setNuevaPlantilla(p => ({ ...p, asunto: e.target.value }))} placeholder="Asunto del correo"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea value={nuevaPlantilla.cuerpo_html} onChange={e => setNuevaPlantilla(p => ({ ...p, cuerpo_html: e.target.value }))}
            placeholder="Cuerpo del correo (HTML). ej: Hola {{nombre_cliente}}, ..." rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          <button onClick={crearPlantilla} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
            + Crear plantilla
          </button>
        </div>
      </section>
    </div>
  )
}
