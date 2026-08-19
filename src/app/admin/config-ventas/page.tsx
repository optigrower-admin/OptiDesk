'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/ventas/pipeline'
import { VARIABLES_CORREO } from '@/lib/ventas/variablesCorreo'
import PipelinesConfig from './components/PipelinesConfig'
import InventarioMotosConfig from './components/InventarioMotosConfig'
import ReglasPipelineConfig from './components/ReglasPipelineConfig'

/* ─── Tipos ─────────────────────────────────────────── */
interface Entidad       { id: string; nombre: string; activa: boolean; orden: number }
interface CategoriaPago { id: string; nombre: string; activa: boolean; orden: number }
interface Bono          { id: string; nombre: string; activa: boolean; orden: number }

interface ColorVariante {
  id?: string
  nombre: string
  imagen_key?: string
  dias_entrega?: number
  orden: number
}
interface LocalColorVariante extends ColorVariante {
  previewUrl?: string
}

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
  cotizacion_incluye: string
  cotizacion_badges: string
  cotizacion_testimonial: string
  fotos: { tipo: string; r2_key: string }[]
  colores_detalle: ColorVariante[]
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
interface Plantilla { id: string; nombre: string; asunto: string; cuerpo_html: string; destinatario: string | null; documentos_adjuntos: string[] | null; bloquear_si_falta_documento: boolean; activa: boolean }

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

/* ─── Slot de variante de color ─────────────────────── */
function ColorVarianteSlot({ motoId, color, index, onChange, onRemove }: {
  motoId: string
  color: LocalColorVariante
  index: number
  onChange: (c: LocalColorVariante) => void
  onRemove: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const imgSrc = color.previewUrl || (color.imagen_key ? `/api/catalogo-fotos/view?key=${color.imagen_key}` : '')

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const res = await fetch('/api/catalogo-colores/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moto_catalogo_id: motoId, index, content_type: file.type }),
      })
      const { url, key } = await res.json()
      await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      onChange({ ...color, imagen_key: key, previewUrl: URL.createObjectURL(file) })
    } catch { /* silencioso */ }
    finally { setUploading(false) }
  }

  return (
    <div className="relative rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 bg-white overflow-hidden flex flex-col transition-colors">
      <button type="button" onClick={onRemove}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center leading-none">
        ×
      </button>

      <div onClick={() => !uploading && fileRef.current?.click()}
        className="h-20 flex items-center justify-center cursor-pointer overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 hover:opacity-80 transition-opacity">
        {imgSrc ? (
          <img src={imgSrc} alt={color.nombre || 'Color'} className="w-full h-full object-contain p-1.5" onError={() => {}} />
        ) : uploading ? (
          <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          <div className="text-center">
            <span className="text-2xl">🎨</span>
            <p className="text-[9px] text-gray-400 leading-tight mt-0.5">Subir foto</p>
          </div>
        )}
      </div>

      <div className="p-2 space-y-1.5">
        <input value={color.nombre}
          onChange={e => onChange({ ...color, nombre: e.target.value })}
          placeholder="Nombre del color"
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <div className="flex items-center gap-1">
          <input type="number" value={color.dias_entrega ?? ''}
            onChange={e => onChange({ ...color, dias_entrega: parseInt(e.target.value) || undefined })}
            placeholder="—" min={0}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">días entrega</span>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  )
}

/* ─── Sección colapsable ───────────────────────────── */
function SeccionColapsable({ titulo, icono, badge, children, defaultOpen = false }: {
  titulo: string; icono: string; badge?: string | number
  children: React.ReactNode; defaultOpen?: boolean
}) {
  const [abierto, setAbierto] = useState(defaultOpen)
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setAbierto(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        <span className="text-lg">{icono}</span>
        <span className="font-bold text-gray-900 flex-1 text-sm">{titulo}</span>
        {badge !== undefined && (
          <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{badge}</span>
        )}
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {abierto && <div className="border-t border-gray-100">{children}</div>}
    </section>
  )
}

/* ─── Tarjeta por vehículo — compacta cuando cerrada ── */
function MotoCard({ m, recargoTarjeta, tenantId, onSave, onToggle, onDelete }: {
  m: MotoCat
  recargoTarjeta: number
  tenantId: string
  onSave:   (id: string, campos: Partial<MotoCat>) => void
  onToggle: (id: string, activa: boolean) => void
  onDelete: (id: string, referencia: string) => void
}) {
  const supabase = createClient()
  const [open, setOpen]     = useState(false)
  const [local, setLocal]   = useState(m)
  const [saving, setSaving] = useState(false)
  const [fotos, setFotos]   = useState(m.fotos)
  const [coloresLocal, setColoresLocal] = useState<LocalColorVariante[]>(
    m.colores_detalle.map(c => ({ ...c }))
  )
  const [savingColores, setSavingColores] = useState(false)
  const [coloresOk, setColoresOk] = useState(false)

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
      referencia: local.referencia.trim() || m.referencia,
      precio: local.precio, costo_documentos: local.costo_documentos, costo_prenda: local.costo_prenda,
      tagline_venta: local.tagline_venta, cilindraje: local.cilindraje, potencia: local.potencia,
      frenos: local.frenos, combustible: local.combustible, rendimiento: local.rendimiento,
      velocidad_max: local.velocidad_max, garantia: local.garantia,
      caracteristica: local.caracteristica,
      cotizacion_beneficios:  local.cotizacion_beneficios,
      cotizacion_incluye:     local.cotizacion_incluye,
      cotizacion_badges:      local.cotizacion_badges,
      cotizacion_testimonial: local.cotizacion_testimonial,
    })
    setSaving(false)
  }

  async function guardarColores() {
    setSavingColores(true)
    try {
      await supabase.from('motos_catalogo_colores').delete().eq('moto_catalogo_id', m.id)
      const validos = coloresLocal.filter(c => c.nombre.trim())
      if (validos.length > 0) {
        await supabase.from('motos_catalogo_colores').insert(
          validos.map((c, i) => ({
            moto_catalogo_id: m.id,
            tenant_id: tenantId,
            nombre: c.nombre.trim(),
            imagen_key: c.imagen_key || null,
            dias_entrega: c.dias_entrega || null,
            orden: i,
          }))
        )
      }
      setColoresOk(true)
      setTimeout(() => setColoresOk(false), 2500)
    } catch { /* silencioso */ }
    finally { setSavingColores(false) }
  }

  return (
    <div className={`rounded-xl border transition-all ${m.activa ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>

      {/* ── CABECERA COMPACTA ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
          <span className={`font-semibold text-sm truncate ${m.activa ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{m.referencia}</span>
          {local.cilindraje && <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">{local.cilindraje}</span>}
          {fotos.length > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{fotos.length}📷</span>}
          {!open && local.precio > 0 && (
            <span className="text-[10px] text-emerald-700 font-semibold flex-shrink-0 ml-auto pr-2">{formatCOP(conPapeles)}</span>
          )}
        </button>
        <ToggleSwitch activo={m.activa} onChange={() => onToggle(m.id, m.activa)} />
      </div>

      {/* ── EXPANDIDO ── */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-5">

          {/* Nombre / Referencia */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nombre del vehículo</label>
            <input value={local.referencia}
              onChange={e => setLocal(p => ({ ...p, referencia: e.target.value }))}
              placeholder="ej: PULSAR NS 200 / TORITO NG CARPA LUJO"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Precios — ahora dentro del expandido */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Precios</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Sin papeles</label>
                <input type="number" value={local.precio}
                  onChange={e => setLocal(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Costo papeles</label>
                <input type="number" value={local.costo_documentos}
                  onChange={e => setLocal(p => ({ ...p, costo_documentos: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Costo pignoración</label>
                <input type="number" value={local.costo_prenda}
                  onChange={e => setLocal(p => ({ ...p, costo_prenda: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { label: 'Sin papeles',           val: local.precio,         cls: 'bg-gray-50 text-gray-800' },
                { label: 'Con papeles',            val: conPapeles,           cls: 'bg-emerald-50 text-emerald-700' },
                { label: 'Pignorada',              val: conPrenda,            cls: 'bg-blue-50 text-blue-700' },
                { label: `Tarjeta+papeles +${recargoTarjeta}%`, val: conTarjetaPapeles, cls: 'bg-amber-50 text-amber-700' },
                { label: `Tarjeta+pignor. +${recargoTarjeta}%`, val: conTarjetaPrenda,  cls: 'bg-orange-50 text-orange-700' },
              ].map(({ label, val, cls }) => (
                <div key={label} className={`${cls} rounded-lg px-2 py-2`}>
                  <div className="text-[8px] font-semibold uppercase leading-tight opacity-70 mb-0.5">{label}</div>
                  <div className="text-xs font-bold">{formatCOP(val)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fotos */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fotos del vehículo</p>
            <div className="flex gap-4 flex-wrap">
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

          {/* Ficha técnica */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ficha técnica</p>
            <p className="text-[10px] text-gray-400 mb-2">💡 Puedes iniciar cualquier valor con un emoji para personalizar su ícono en la cotización. Ej: <span className="font-mono">🔥 200cc</span></p>
            <div className="space-y-2">
              <div><label className="text-xs text-gray-500 block mb-1">Tagline de venta</label>{campo('tagline_venta')}</div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500 block mb-1">⚙️ Cilindraje</label>{campo('cilindraje')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">⚡ Potencia</label>{campo('potencia')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">🛡️ Frenos</label>{campo('frenos')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">⛽ Combustible</label>{campo('combustible')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">📊 Rendimiento</label>{campo('rendimiento')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">🏎️ Velocidad máx.</label>{campo('velocidad_max')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">✅ Garantía</label>{campo('garantia')}</div>
                <div><label className="text-xs text-gray-500 block mb-1">✨ Característica especial</label>{campo('caracteristica')}</div>
              </div>
              {/* Colores — nuevo sistema visual */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">
                  🎨 Colores disponibles
                  <span className="font-normal text-gray-400 ml-1">(máx. 6 — haz clic en la imagen para subir foto del color)</span>
                </label>
                {coloresLocal.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {coloresLocal.map((c, i) => (
                      <ColorVarianteSlot key={i} motoId={m.id} color={c} index={i}
                        onChange={nc => setColoresLocal(p => p.map((x, j) => j === i ? nc : x))}
                        onRemove={() => setColoresLocal(p => p.filter((_, j) => j !== i))} />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {coloresLocal.length < 6 && (
                    <button type="button"
                      onClick={() => setColoresLocal(p => [...p, { nombre: '', orden: p.length }])}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors">
                      + Agregar color
                    </button>
                  )}
                  <button type="button" onClick={guardarColores} disabled={savingColores}
                    className="px-3 py-1 bg-blue-700 text-white text-xs rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors">
                    {savingColores ? 'Guardando...' : '✓ Guardar colores'}
                  </button>
                  {coloresOk && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
                  {coloresLocal.length > 0 && (
                    <span className="text-[10px] text-gray-400">{coloresLocal.length}/6</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cotización — campos editables por vehículo */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Para cotización</p>

            {/* Esta cotización incluye — por vehículo */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Esta cotización incluye <span className="font-normal text-gray-400">(uno por línea, emoji al inicio para personalizar ícono)</span>
              </label>
              <textarea
                value={local.cotizacion_incluye ?? ''}
                onChange={e => setLocal(p => ({ ...p, cotizacion_incluye: e.target.value }))}
                rows={5}
                placeholder={'🛡️ SOAT obligatorio\n📋 Matrícula + impuestos\n📖 Manual del propietario\n🏭 Garantía de fábrica\n🔧 3 revisiones mano de obra gratis'}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Vacío = usa los predeterminados del sistema.</p>
            </div>

            {/* Beneficios */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                ¿Por qué es la decisión correcta? <span className="font-normal text-gray-400">(uno por línea: emoji Título|Descripción)</span>
              </label>
              <textarea
                value={local.cotizacion_beneficios ?? ''}
                onChange={e => setLocal(p => ({ ...p, cotizacion_beneficios: e.target.value }))}
                rows={4}
                placeholder={'🚀 Movilidad sin límites|Llega a tiempo\n💰 Inversión inteligente|Ahorra 4x en combustible\n🛡️ Garantía incluida|Respaldo total'}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Vacío = predeterminados del sistema.</p>
            </div>

            {/* Badges */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Badges de confianza <span className="font-normal text-gray-400">(3 líneas: emoji|TÍTULO|Subtítulo)</span>
              </label>
              <textarea
                value={local.cotizacion_badges ?? ''}
                onChange={e => setLocal(p => ({ ...p, cotizacion_badges: e.target.value }))}
                rows={3}
                placeholder={'🛡️|GARANTÍA|12 MESES*\n⭐|CALIDAD|CERTIFICADA\n👍|CLIENTES|SATISFECHOS'}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Ej: <span className="font-mono">🔧|REVISIONES|3 GRATIS</span></p>
            </div>

            {/* Testimonio */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Testimonio <span className="font-normal text-gray-400">(Texto|Nombre del cliente)</span>
              </label>
              <input
                value={local.cotizacion_testimonial ?? ''}
                onChange={e => setLocal(p => ({ ...p, cotizacion_testimonial: e.target.value }))}
                placeholder="Excelente atención, entrega rápida y sin complicaciones.|Juan Pérez"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Separa el texto y el nombre con |</p>
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
  cotizacion_incluye: '',
  cotizacion_badges: '',
  cotizacion_testimonial: '',
  colores_detalle: [],
}

/* ═══════════════════════════════════════════════════════════ */
export default function ConfigVentasPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [entidades, setEntidades]         = useState<Entidad[]>([])
  const [nuevaEntidad, setNuevaEntidad]   = useState('')
  const [editandoEntidadId, setEditandoEntidadId]       = useState<string | null>(null)
  const [editandoEntidadNombre, setEditandoEntidadNombre] = useState('')
  const [categoriasPago, setCategoriasPago]     = useState<CategoriaPago[]>([])
  const [nuevaCategoriaPago, setNuevaCategoriaPago] = useState('')
  const [editandoCatId, setEditandoCatId]       = useState<string | null>(null)
  const [editandoCatNombre, setEditandoCatNombre] = useState('')
  const [bonos, setBonos]                 = useState<Bono[]>([])
  const [nuevoBono, setNuevoBono]         = useState('')
  const [editandoBonoId, setEditandoBonoId]       = useState<string | null>(null)
  const [editandoBonoNombre, setEditandoBonoNombre] = useState('')
  const [motos, setMotos]                 = useState<MotoCat[]>([])
  const [tipos, setTipos]                 = useState<TipoRecordatorio[]>([])
  const [plantillas, setPlantillas]       = useState<Plantilla[]>([])
  const [catalogoDocumentos, setCatalogoDocumentos] = useState<string[]>([])
  const [nuevaPlantilla, setNuevaPlantilla] = useState({ nombre: '', asunto: '', cuerpo_html: '', destinatario: '', documentos_adjuntos: new Set<string>(), bloquear_si_falta_documento: true })
  const [editandoPlantillaId, setEditandoPlantillaId] = useState<string | null>(null)
  const [editandoPlantilla, setEditandoPlantilla] = useState({ nombre: '', asunto: '', cuerpo_html: '', destinatario: '', documentos_adjuntos: new Set<string>(), bloquear_si_falta_documento: false })
  const [cotInfo, setCotInfo]             = useState<CotizacionInfo>({ tagline: '', direccion: '', telefono1: '', telefono2: '', email: '', web: '', whatsapp: '', instagram: '', facebook: '', tiktok: '', incluye: '', recargoTarjeta: 5 })
  const [savingCotInfo, setSavingCotInfo] = useState(false)
  const [cotInfoOk, setCotInfoOk]         = useState(false)
  const [logoUrl, setLogoUrl]             = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [loading, setLoading]             = useState(true)
  const [showNuevaMoto, setShowNuevaMoto] = useState(false)
  const [nuevaMoto, setNuevaMoto]         = useState<typeof NUEVA_MOTO_VACIA>(NUEVA_MOTO_VACIA)
  const [creandoMoto, setCreandoMoto]     = useState(false)
  const cargandoRef = useRef(false)

  // ── Etiquetas ──────────────────────────────────────────────────────────────
  const [etiquetas, setEtiquetas]       = useState<{ id: string; nombre: string; color: string }[]>([])
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState({ nombre: '', color: '#3B82F6' })
  const [savingEtiqueta, setSavingEtiqueta] = useState(false)
  const [editEtiqueta, setEditEtiqueta] = useState<{ id: string; nombre: string; color: string } | null>(null)

  // ── APIs IA ────────────────────────────────────────────────────────────────
  const [configApis, setConfigApis]           = useState({ openai_key: '', anthropic_key: '', elevenlabs_key: '', openai_modelo: 'gpt-4o-mini', anthropic_modelo: 'claude-haiku-4-5-20251001', elevenlabs_voz_id: '' })
  const [savingApis, setSavingApis]           = useState(false)
  const [apisOk, setApisOk]                  = useState(false)
  const [agentes, setAgentes]                 = useState<{ id: string; nombre: string; proveedor: string; modelo: string | null; prompt_sistema: string | null; instrucciones: string | null; temperatura: number; max_tokens: number; activo: boolean }[]>([])
  const [nuevoAgente, setNuevoAgente]         = useState({ nombre: '', proveedor: 'openai', modelo: '', prompt_sistema: '', instrucciones: '', temperatura: 0.7, max_tokens: 800 })
  const [savingAgente, setSavingAgente]       = useState(false)
  const [editAgente, setEditAgente]           = useState<string | null>(null)

  // ── Asesores asignables ───────────────────────────────────────────────────
  type UsuarioEquipo = { id: string; nombre: string | null; email: string | null; es_asesor: boolean }
  const [usuariosEquipo, setUsuariosEquipo]               = useState<UsuarioEquipo[]>([])
  const [togglingAsesor, setTogglingAsesor]               = useState<string | null>(null)

  // ── Drive para archivos de clientes ───────────────────────────────────────
  const [ventasFolderUrl, setVentasFolderUrl]             = useState('')
  const [ventasFolderConfigured, setVentasFolderConfigured] = useState<string | null>(null)
  const [driveConnected, setDriveConnected]               = useState(false)
  const [savingDrive, setSavingDrive]                     = useState(false)
  const [driveOk, setDriveOk]                             = useState(false)
  const [migrando, setMigrando]                           = useState(false)
  const [migrMsg, setMigrMsg]                             = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    if (cargandoRef.current) return   // evita ejecuciones concurrentes
    cargandoRef.current = true

    const [{ data: ent }, { data: tip }, { data: plant }, { data: reglasDocs }] = await Promise.all([
      supabase.from('entidades_financieras').select('id, nombre, activa, orden').eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('tipos_recordatorio_automatico').select('id, tipo, activo, dias_umbral').eq('tenant_id', profile.tenant_id),
      supabase.from('plantillas_correo').select('id, nombre, asunto, cuerpo_html, destinatario, documentos_adjuntos, bloquear_si_falta_documento, activa').eq('tenant_id', profile.tenant_id).order('orden'),
      supabase.from('reglas_etapa').select('documentos_requeridos').eq('campo', 'documento_requerido').eq('activa', true),
    ])
    const catalogo = new Set<string>()
    for (const r of reglasDocs ?? []) {
      for (const d of (r.documentos_requeridos ?? []) as string[]) catalogo.add(d)
    }
    setCatalogoDocumentos([...catalogo])

    // ── Tenant: queries defensivas separadas por migración ──
    // Base (siempre existe): logo_url y recargo
    const { data: tenBase } = await supabase.from('tenants')
      .select('logo_url, recargo_tarjeta_porcentaje').eq('id', profile.tenant_id).single()

    // V61 (cotizacion contact fields) — pueden no existir si la migración no corrió
    const { data: ten61 } = await supabase.from('tenants')
      .select('cotizacion_tagline, cotizacion_direccion, cotizacion_telefono1, cotizacion_telefono2, cotizacion_email, cotizacion_web, cotizacion_whatsapp')
      .eq('id', profile.tenant_id).single()

    // V62 (redes sociales) — pueden no existir
    const { data: ten62 } = await supabase.from('tenants')
      .select('cotizacion_instagram, cotizacion_facebook, cotizacion_tiktok')
      .eq('id', profile.tenant_id).single()

    // V63 (incluye editable) — pueden no existir
    const { data: ten63 } = await supabase.from('tenants')
      .select('cotizacion_incluye').eq('id', profile.tenant_id).single()

    // Cargamos motos en dos pasos para que un fallo en las columnas nuevas
    // (si la migration_v61 no se corrió aún) no oculte las motos existentes.
    const { data: motBase, error: motErr } = await supabase
      .from('motos_catalogo')
      .select('id, referencia, precio, costo_documentos, costo_prenda, activa, tagline_venta, cilindraje, potencia, frenos, combustible, rendimiento, velocidad_max, garantia, colores, caracteristica, cotizacion_beneficios, cotizacion_incluye, cotizacion_badges, cotizacion_testimonial')
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

    // Fotos y colores en queries separadas — si las tablas no existen aún, quedan vacíos
    const motoIds = (mot ?? []).map((mo: { id: string }) => mo.id)

    const { data: fotosAll } = await supabase
      .from('motos_catalogo_fotos')
      .select('moto_catalogo_id, tipo, r2_key')
      .in('moto_catalogo_id', motoIds.length > 0 ? motoIds : ['__none__'])

    const fotosPorMoto: Record<string, { tipo: string; r2_key: string }[]> = {}
    for (const f of fotosAll ?? []) {
      if (!fotosPorMoto[f.moto_catalogo_id]) fotosPorMoto[f.moto_catalogo_id] = []
      fotosPorMoto[f.moto_catalogo_id].push({ tipo: f.tipo, r2_key: f.r2_key })
    }

    // Colores en query defensiva (tabla v69, puede no existir aún)
    const coloresPorMoto: Record<string, ColorVariante[]> = {}
    if (motoIds.length > 0) {
      const { data: coloresAll } = await supabase
        .from('motos_catalogo_colores')
        .select('id, moto_catalogo_id, nombre, imagen_key, dias_entrega, orden')
        .in('moto_catalogo_id', motoIds)
        .order('orden')
      for (const c of coloresAll ?? []) {
        if (!coloresPorMoto[c.moto_catalogo_id]) coloresPorMoto[c.moto_catalogo_id] = []
        coloresPorMoto[c.moto_catalogo_id].push({
          id: c.id, nombre: c.nombre, imagen_key: c.imagen_key, dias_entrega: c.dias_entrega, orden: c.orden,
        })
      }
    }

    // Deduplicar por ID por seguridad (evita duplicados si cargar corre dos veces)
    const seenIds = new Set<string>()
    const motUniq = (mot ?? []).filter(m => {
      if (seenIds.has(m.id)) return false
      seenIds.add(m.id)
      return true
    })

    setEntidades((ent ?? []) as Entidad[])
    setMotos(motUniq.map(m => ({
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
      cotizacion_beneficios: (m as never as Record<string,string>).cotizacion_beneficios  ?? '',
      cotizacion_incluye:    (m as never as Record<string,string>).cotizacion_incluye     ?? '',
      cotizacion_badges:     (m as never as Record<string,string>).cotizacion_badges      ?? '',
      cotizacion_testimonial:(m as never as Record<string,string>).cotizacion_testimonial ?? '',
      fotos:                fotosPorMoto[m.id] ?? [],
      colores_detalle:      coloresPorMoto[m.id] ?? [],
    })) as MotoCat[])
    setTipos((tip ?? []) as TipoRecordatorio[])
    setPlantillas((plant ?? []) as Plantilla[])
    // Logo y recargo siempre disponibles (columnas base del tenant)
    setLogoUrl(tenBase?.logo_url ?? '')
    setCotInfo({
      tagline:        ten61?.cotizacion_tagline    ?? '',
      direccion:      ten61?.cotizacion_direccion  ?? '',
      telefono1:      ten61?.cotizacion_telefono1  ?? '',
      telefono2:      ten61?.cotizacion_telefono2  ?? '',
      email:          ten61?.cotizacion_email      ?? '',
      web:            ten61?.cotizacion_web        ?? '',
      whatsapp:       ten61?.cotizacion_whatsapp   ?? '',
      instagram:      ten62?.cotizacion_instagram  ?? '',
      facebook:       ten62?.cotizacion_facebook   ?? '',
      tiktok:         ten62?.cotizacion_tiktok     ?? '',
      incluye:        ten63?.cotizacion_incluye    ?? '',
      recargoTarjeta: tenBase?.recargo_tarjeta_porcentaje ?? 5,
    })
    // Categorías de pago (defensiva, pueden no existir si la migración v66 no corrió)
    const { data: cats } = await supabase.from('categorias_pago')
      .select('id, nombre, activa, orden').eq('tenant_id', profile.tenant_id).order('orden')
    setCategoriasPago((cats ?? []) as CategoriaPago[])

    // Bonos (defensiva, pueden no existir si la migración v113 no corrió)
    const { data: bns } = await supabase.from('bonos')
      .select('id, nombre, activa, orden').eq('tenant_id', profile.tenant_id).order('orden')
    setBonos((bns ?? []) as Bono[])

    // APIs IA + Agentes (defensivo, migración v78)
    const [{ data: apisCfg }, { data: agts }] = await Promise.all([
      supabase.from('config_apis_ia').select('*').eq('tenant_id', profile.tenant_id).maybeSingle(),
      supabase.from('agentes_ia').select('id, nombre, proveedor, modelo, prompt_sistema, instrucciones, temperatura, max_tokens, activo').eq('tenant_id', profile.tenant_id).order('created_at'),
    ])
    if (apisCfg) {
      setConfigApis({
        openai_key:       apisCfg.openai_key_enc       ? '••••••••••••••••' : '',
        anthropic_key:    apisCfg.anthropic_key_enc    ? '••••••••••••••••' : '',
        elevenlabs_key:   apisCfg.elevenlabs_key_enc   ? '••••••••••••••••' : '',
        openai_modelo:    apisCfg.openai_modelo_default  ?? 'gpt-4o-mini',
        anthropic_modelo: apisCfg.anthropic_modelo_default ?? 'claude-haiku-4-5-20251001',
        elevenlabs_voz_id: apisCfg.elevenlabs_voz_id   ?? '',
      })
    }
    setAgentes(agts ?? [])

    // Etiquetas de venta
    const { data: etqs } = await supabase
      .from('etiquetas_venta')
      .select('id, nombre, color')
      .eq('tenant_id', profile.tenant_id)
      .order('nombre')
    setEtiquetas(etqs ?? [])

    // Usuarios del equipo (para configurar quiénes son asesores asignables en ventas)
    const { data: equipo } = await supabase
      .from('usuarios')
      .select('id, nombre, email, es_asesor')
      .eq('tenant_id', profile.tenant_id)
      .order('nombre')
    setUsuariosEquipo((equipo ?? []).map(u => ({
      id: u.id as string,
      nombre: u.nombre as string | null,
      email: u.email as string | null,
      es_asesor: (u.es_asesor ?? false) as boolean,
    })))

    setLoading(false)
    cargandoRef.current = false
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (loading) return
    fetch('/api/admin/ventas/config-drive')
      .then(r => r.json())
      .then(d => {
        setVentasFolderConfigured(d.ventas_drive_folder_id ?? null)
        setDriveConnected(d.drive_connected ?? false)
        if (d.ventas_drive_folder_id) setVentasFolderUrl(d.ventas_drive_folder_id)
      })
      .catch(() => {})
    const params = new URLSearchParams(window.location.search)
    if (params.get('drive_ok') === '1') {
      window.history.replaceState({}, '', '/admin/config-ventas')
      setDriveConnected(true)
    }
  }, [loading])

  useEffect(() => {
    if (!profile?.tenant_id || loading) return
    const faltantes = (Object.keys(TIPO_LABEL) as (keyof typeof TIPO_LABEL)[]).filter(t => !tipos.some(x => x.tipo === t))
    if (faltantes.length === 0) return
    Promise.all(faltantes.map(tipo =>
      supabase.from('tipos_recordatorio_automatico').insert({ tenant_id: profile.tenant_id, tipo, activo: true, dias_umbral: 7 })
    )).then(cargar)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, loading])

  /* ── Categorías de pago ── */
  const DEFAULT_CATEGORIAS = ['Cuota Inicial', 'Crédito Progreser', 'Crédito Banco Mujer', 'Pago por transferencia', 'Pago en efectivo']

  async function agregarCategoriaPago() {
    if (!nuevaCategoriaPago.trim() || !profile?.tenant_id) return
    const orden = categoriasPago.length
    const { data } = await supabase.from('categorias_pago')
      .insert({ tenant_id: profile.tenant_id, nombre: nuevaCategoriaPago.trim(), orden })
      .select().single()
    if (data) setCategoriasPago(p => [...p, data as CategoriaPago])
    setNuevaCategoriaPago('')
  }

  async function guardarEditCategoria(id: string) {
    if (!editandoCatNombre.trim()) return
    await supabase.from('categorias_pago').update({ nombre: editandoCatNombre.trim() }).eq('id', id)
    setCategoriasPago(p => p.map(c => c.id === id ? { ...c, nombre: editandoCatNombre.trim() } : c))
    setEditandoCatId(null)
  }

  async function toggleCategoriaPago(id: string, activa: boolean) {
    await supabase.from('categorias_pago').update({ activa: !activa }).eq('id', id)
    setCategoriasPago(p => p.map(c => c.id === id ? { ...c, activa: !activa } : c))
  }

  async function eliminarCategoriaPago(id: string) {
    if (!confirm('¿Eliminar esta categoría? Los pagos existentes con esta categoría la perderán.')) return
    await supabase.from('categorias_pago').delete().eq('id', id)
    setCategoriasPago(p => p.filter(c => c.id !== id))
  }

  async function sembrarCategoriasPago() {
    if (!profile?.tenant_id) return
    await Promise.all(DEFAULT_CATEGORIAS.map((nombre, orden) =>
      supabase.from('categorias_pago').insert({ tenant_id: profile.tenant_id, nombre, orden })
    ))
    cargar()
  }

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
  async function renombrarEntidad() {
    if (!editandoEntidadId || !editandoEntidadNombre.trim()) return
    await supabase.from('entidades_financieras').update({ nombre: editandoEntidadNombre.trim() }).eq('id', editandoEntidadId)
    setEntidades(p => p.map(e => e.id === editandoEntidadId ? { ...e, nombre: editandoEntidadNombre.trim() } : e))
    setEditandoEntidadId(null); setEditandoEntidadNombre('')
  }
  async function moverEntidad(id: string, dir: -1 | 1) {
    const idx = entidades.findIndex(e => e.id === id)
    const destino = idx + dir
    if (idx < 0 || destino < 0 || destino >= entidades.length) return
    const reordenadas = [...entidades]
    ;[reordenadas[idx], reordenadas[destino]] = [reordenadas[destino], reordenadas[idx]]
    const conOrden = reordenadas.map((e, i) => ({ ...e, orden: i }))
    setEntidades(conOrden)
    await Promise.all(conOrden.map(e => supabase.from('entidades_financieras').update({ orden: e.orden }).eq('id', e.id)))
  }

  /* ── Bonos ── */
  const DEFAULT_BONOS = ['Financiera', 'UMA', 'Motospace38']

  async function agregarBono() {
    if (!nuevoBono.trim() || !profile?.tenant_id) return
    const orden = bonos.length
    await supabase.from('bonos').insert({ tenant_id: profile.tenant_id, nombre: nuevoBono.trim(), orden })
    setNuevoBono('')
    cargar()
  }
  async function toggleBono(id: string, activa: boolean) {
    await supabase.from('bonos').update({ activa: !activa }).eq('id', id)
    setBonos(p => p.map(b => b.id === id ? { ...b, activa: !activa } : b))
  }
  async function eliminarBono(id: string) {
    if (!confirm('¿Eliminar este bono?')) return
    await supabase.from('bonos').delete().eq('id', id)
    cargar()
  }
  async function renombrarBono() {
    if (!editandoBonoId || !editandoBonoNombre.trim()) return
    await supabase.from('bonos').update({ nombre: editandoBonoNombre.trim() }).eq('id', editandoBonoId)
    setBonos(p => p.map(b => b.id === editandoBonoId ? { ...b, nombre: editandoBonoNombre.trim() } : b))
    setEditandoBonoId(null); setEditandoBonoNombre('')
  }
  async function sembrarBonos() {
    if (!profile?.tenant_id) return
    await Promise.all(DEFAULT_BONOS.map((nombre, orden) =>
      supabase.from('bonos').insert({ tenant_id: profile.tenant_id, nombre, orden })
    ))
    cargar()
  }

  /* ── Asesores ── */
  async function toggleAsesor(id: string, actual: boolean) {
    setTogglingAsesor(id)
    await supabase.from('usuarios').update({ es_asesor: !actual }).eq('id', id)
    setUsuariosEquipo(p => p.map(u => u.id === id ? { ...u, es_asesor: !actual } : u))
    setTogglingAsesor(null)
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
    if (!nuevaPlantilla.nombre.trim() || !nuevaPlantilla.asunto.trim() || !nuevaPlantilla.cuerpo_html.trim() || !nuevaPlantilla.destinatario.trim() || !profile?.tenant_id) return
    await supabase.from('plantillas_correo').insert({
      tenant_id: profile.tenant_id,
      nombre: nuevaPlantilla.nombre,
      asunto: nuevaPlantilla.asunto,
      cuerpo_html: nuevaPlantilla.cuerpo_html,
      destinatario: nuevaPlantilla.destinatario,
      documentos_adjuntos: [...nuevaPlantilla.documentos_adjuntos],
      bloquear_si_falta_documento: nuevaPlantilla.bloquear_si_falta_documento,
      created_by: profile.id,
    })
    setNuevaPlantilla({ nombre: '', asunto: '', cuerpo_html: '', destinatario: '', documentos_adjuntos: new Set(), bloquear_si_falta_documento: true })
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
  function abrirEditarPlantilla(p: Plantilla) {
    setEditandoPlantillaId(p.id)
    setEditandoPlantilla({
      nombre: p.nombre, asunto: p.asunto, cuerpo_html: p.cuerpo_html,
      destinatario: p.destinatario ?? '', documentos_adjuntos: new Set(p.documentos_adjuntos ?? []),
      bloquear_si_falta_documento: p.bloquear_si_falta_documento ?? false,
    })
  }
  async function guardarEditarPlantilla() {
    if (!editandoPlantillaId || !editandoPlantilla.nombre.trim() || !editandoPlantilla.asunto.trim() || !editandoPlantilla.cuerpo_html.trim() || !editandoPlantilla.destinatario.trim()) return
    await supabase.from('plantillas_correo').update({
      nombre: editandoPlantilla.nombre,
      asunto: editandoPlantilla.asunto,
      cuerpo_html: editandoPlantilla.cuerpo_html,
      destinatario: editandoPlantilla.destinatario,
      documentos_adjuntos: [...editandoPlantilla.documentos_adjuntos],
      bloquear_si_falta_documento: editandoPlantilla.bloquear_si_falta_documento,
    }).eq('id', editandoPlantillaId)
    setEditandoPlantillaId(null)
    cargar()
  }

  /* ── Etiquetas ── */
  async function crearEtiqueta() {
    if (!nuevaEtiqueta.nombre.trim() || !profile?.tenant_id) return
    setSavingEtiqueta(true)
    const res = await fetch('/api/admin/ventas/etiquetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'crear', nombre: nuevaEtiqueta.nombre.trim(), color: nuevaEtiqueta.color }),
    })
    if (res.ok) {
      const { etiqueta } = await res.json() as { etiqueta: { id: string; nombre: string; color: string } }
      setEtiquetas(e => [...e, etiqueta].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNuevaEtiqueta({ nombre: '', color: '#3B82F6' })
    }
    setSavingEtiqueta(false)
  }

  async function guardarEdicionEtiqueta() {
    if (!editEtiqueta) return
    await fetch('/api/admin/ventas/etiquetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'editar', etiqueta_id: editEtiqueta.id, nombre: editEtiqueta.nombre, color: editEtiqueta.color }),
    })
    setEtiquetas(e => e.map(et => et.id === editEtiqueta.id ? { ...et, nombre: editEtiqueta.nombre, color: editEtiqueta.color } : et))
    setEditEtiqueta(null)
  }

  async function eliminarEtiqueta(id: string) {
    await fetch('/api/admin/ventas/etiquetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', etiqueta_id: id }),
    })
    setEtiquetas(e => e.filter(et => et.id !== id))
  }

  /* ── APIs IA ── */
  async function guardarApis(partial: Partial<typeof configApis>) {
    if (!profile?.tenant_id) return
    setSavingApis(true)
    try {
      const body: Record<string, string> = {}
      if (partial.openai_key     && !partial.openai_key.startsWith('•'))    body.openai_key     = partial.openai_key
      if (partial.anthropic_key  && !partial.anthropic_key.startsWith('•')) body.anthropic_key  = partial.anthropic_key
      if (partial.elevenlabs_key && !partial.elevenlabs_key.startsWith('•'))body.elevenlabs_key = partial.elevenlabs_key
      if (partial.openai_modelo)    body.openai_modelo    = partial.openai_modelo
      if (partial.anthropic_modelo) body.anthropic_modelo = partial.anthropic_modelo
      if (partial.elevenlabs_voz_id !== undefined) body.elevenlabs_voz_id = partial.elevenlabs_voz_id

      const res = await fetch('/api/admin/config-apis-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) { setApisOk(true); setTimeout(() => setApisOk(false), 2500) }
      else { alert('Error al guardar APIs') }
    } finally {
      setSavingApis(false)
    }
  }

  async function crearAgente() {
    if (!profile?.tenant_id || !nuevoAgente.nombre.trim()) return
    setSavingAgente(true)
    try {
      const { data: a } = await supabase.from('agentes_ia').insert({
        tenant_id:      profile.tenant_id,
        nombre:         nuevoAgente.nombre.trim(),
        proveedor:      nuevoAgente.proveedor,
        modelo:         nuevoAgente.modelo || null,
        prompt_sistema: nuevoAgente.prompt_sistema || null,
        instrucciones:  nuevoAgente.instrucciones || null,
        temperatura:    nuevoAgente.temperatura,
        max_tokens:     nuevoAgente.max_tokens,
      }).select('id, nombre, proveedor, modelo, prompt_sistema, instrucciones, temperatura, max_tokens, activo').single()
      if (a) setAgentes(prev => [...prev, a])
      setNuevoAgente({ nombre: '', proveedor: 'openai', modelo: '', prompt_sistema: '', instrucciones: '', temperatura: 0.7, max_tokens: 800 })
    } finally { setSavingAgente(false) }
  }

  async function actualizarAgente(id: string, patch: Partial<(typeof agentes)[number]>) {
    await supabase.from('agentes_ia').update(patch).eq('id', id)
    setAgentes(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  async function eliminarAgente(id: string) {
    if (!confirm('¿Eliminar este agente IA?')) return
    await supabase.from('agentes_ia').delete().eq('id', id)
    setAgentes(prev => prev.filter(a => a.id !== id))
  }

  /* ── Logo ── */
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.tenant_id) return
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tenant_id', profile.tenant_id)
      const res = await fetch('/api/admin/upload-logo', { method: 'POST', body: fd })
      const json = await res.json() as { ok?: boolean; logo_url?: string; error?: string }
      if (res.ok && json.logo_url) {
        setLogoUrl(json.logo_url)
      } else {
        alert('Error al subir logo: ' + (json.error ?? 'desconocido'))
      }
    } finally {
      setUploadingLogo(false)
    }
  }

  /* ── Info cotización — usa API route con admin client (RLS no permite update directo) ── */
  async function guardarCotInfo() {
    if (!profile?.tenant_id) return
    setSavingCotInfo(true)
    try {
      const res = await fetch('/api/tenant/cotizacion-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagline:        cotInfo.tagline,
          direccion:      cotInfo.direccion,
          telefono1:      cotInfo.telefono1,
          telefono2:      cotInfo.telefono2,
          email:          cotInfo.email,
          web:            cotInfo.web,
          whatsapp:       cotInfo.whatsapp,
          instagram:      cotInfo.instagram,
          facebook:       cotInfo.facebook,
          tiktok:         cotInfo.tiktok,
          incluye:        cotInfo.incluye,
          recargoTarjeta: cotInfo.recargoTarjeta,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        alert('Error al guardar: ' + (err.error ?? `HTTP ${res.status}`))
        return
      }
      setCotInfoOk(true)
      setTimeout(() => setCotInfoOk(false), 2500)
    } finally {
      setSavingCotInfo(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Cargando...</div>

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Config Ventas</h1>
        <p className="text-sm text-gray-500">Catálogos y configuración de cotizaciones (solo Gerencia)</p>
      </div>

      {/* ── Info del negocio ── */}
      <SeccionColapsable titulo="Info del negocio" icono="🏢" defaultOpen={false}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-400">Logo, datos de contacto y redes sociales que aparecen en cada cotización generada.</p>

          {/* Logo */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">Logo <span className="font-normal text-gray-400">(se muestra en el encabezado de la cotización)</span></label>
            <div className="flex items-center gap-4 flex-wrap">
              {logoUrl && (
                <div className="w-28 h-14 rounded-lg border border-gray-200 bg-gray-800 flex items-center justify-center p-2 flex-shrink-0">
                  <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
              )}
              <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${uploadingLogo ? 'opacity-50 pointer-events-none bg-gray-50 border-gray-200 text-gray-400' : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                {uploadingLogo ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                  onChange={handleLogoUpload} disabled={uploadingLogo} />
              </label>
              <p className="text-[10px] text-gray-400">PNG, SVG, JPG o WebP · máx. 3 MB · Recomendado: fondo transparente</p>
            </div>
          </div>

          {/* Eslogan */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Eslogan / Tagline</label>
            <input value={cotInfo.tagline} onChange={e => setCotInfo(p => ({ ...p, tagline: e.target.value }))}
              placeholder="ej: Tu ruta, nuestra pasión."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Dirección</label>
              <input value={cotInfo.direccion} onChange={e => setCotInfo(p => ({ ...p, direccion: e.target.value }))}
                placeholder="ej: Cra 10 # 15-22, Cali"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Teléfono 1</label>
              <input value={cotInfo.telefono1} onChange={e => setCotInfo(p => ({ ...p, telefono1: e.target.value }))}
                placeholder="+57 300 000 0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Teléfono 2</label>
              <input value={cotInfo.telefono2} onChange={e => setCotInfo(p => ({ ...p, telefono2: e.target.value }))}
                placeholder="+57 310 000 0000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Correo electrónico</label>
              <input value={cotInfo.email} onChange={e => setCotInfo(p => ({ ...p, email: e.target.value }))}
                placeholder="ventas@negocio.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Sitio web</label>
              <input value={cotInfo.web} onChange={e => setCotInfo(p => ({ ...p, web: e.target.value }))}
                placeholder="www.negocio.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* WhatsApp + recargo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">WhatsApp (código de país + número, sin +)</label>
              <input value={cotInfo.whatsapp} onChange={e => setCotInfo(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="573001234567"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-gray-400 mt-1">Ej: 573001234567 (57 = Colombia)</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Recargo tarjeta crédito (%)</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={20} step={0.5} value={cotInfo.recargoTarjeta}
                  onChange={e => setCotInfo(p => ({ ...p, recargoTarjeta: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-sm text-gray-500 font-semibold">%</span>
              </div>
            </div>
          </div>

          {/* Redes sociales */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Redes sociales</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Instagram</label>
                <input value={cotInfo.instagram} onChange={e => setCotInfo(p => ({ ...p, instagram: e.target.value }))}
                  placeholder="@motospace38"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Facebook</label>
                <input value={cotInfo.facebook} onChange={e => setCotInfo(p => ({ ...p, facebook: e.target.value }))}
                  placeholder="/motospace38"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">TikTok</label>
                <input value={cotInfo.tiktok} onChange={e => setCotInfo(p => ({ ...p, tiktok: e.target.value }))}
                  placeholder="@motospace38"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Incluye */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">
              &ldquo;Esta cotización incluye&rdquo; <span className="font-normal text-gray-400">(uno por línea)</span>
            </label>
            <textarea value={cotInfo.incluye} onChange={e => setCotInfo(p => ({ ...p, incluye: e.target.value }))}
              rows={5}
              placeholder={'🛡️ SOAT obligatorio\n📋 Matrícula + impuestos\n🏭 Garantía de fábrica\n🔧 3 revisiones mano de obra gratis'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none" />
            <p className="text-[10px] text-gray-400 mt-1">Inicia cada línea con un emoji para usarlo como ícono (ej: 🛡️ SOAT). Si está vacío, se usan los predeterminados.</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={guardarCotInfo} disabled={savingCotInfo}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
              {savingCotInfo ? 'Guardando...' : 'Guardar'}
            </button>
            {cotInfoOk && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
          </div>
        </div>
      </SeccionColapsable>

      {/* ── Catálogo de vehículos ── */}
      <SeccionColapsable titulo="Catálogo de vehículos" icono="🏍️" badge={motos.length} defaultOpen={false}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">Motos, toritos y demás vehículos. Haz clic en cada uno para editarlo.</p>
            <a href="/admin/lista-precios" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Lista de precios
            </a>
          </div>

          <div className="space-y-1.5 mb-3">
            {motos.map(m => (
              <MotoCard key={m.id} m={m} recargoTarjeta={cotInfo.recargoTarjeta}
                tenantId={profile?.tenant_id ?? ''}
                onSave={guardarMoto} onToggle={toggleMoto} onDelete={eliminarMoto} />
            ))}
            {motos.length === 0 && !showNuevaMoto && (
              <p className="text-sm text-gray-400 text-center py-6">Sin vehículos en el catálogo. ¡Agrega el primero!</p>
            )}
          </div>

          {/* Formulario nuevo vehículo */}
          {showNuevaMoto ? (
            <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-blue-800">Nuevo vehículo</span>
                <button onClick={() => { setShowNuevaMoto(false); setNuevaMoto(NUEVA_MOTO_VACIA) }}
                  className="text-gray-400 hover:text-gray-700 text-sm">✕ Cancelar</button>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre / Referencia *</label>
                <input value={nuevaMoto.referencia} onChange={e => setNuevaMoto(p => ({ ...p, referencia: e.target.value }))}
                  placeholder="ej: TORITO NG CARPA LUJO / PULSAR NS 200"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Precios base</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['precio', 'Sin papeles'],
                    ['costo_documentos', 'Costo papeles'],
                    ['costo_prenda', 'Costo pignoración'],
                  ].map(([k, label]) => (
                    <div key={k}>
                      <label className="text-xs text-gray-500 block mb-1">{label}</label>
                      <input type="number" value={(nuevaMoto[k as keyof typeof nuevaMoto] as number) || ''}
                        onChange={e => setNuevaMoto(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ficha técnica (opcional)</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['tagline_venta',  'Tagline de venta',       'ej: La deportiva ideal'],
                    ['cilindraje',     'Cilindraje',             'ej: 199.5 cc'],
                    ['potencia',       'Potencia',               'ej: 24.5 HP'],
                    ['frenos',         'Frenos',                 'ej: ABS Doble Canal'],
                    ['combustible',    'Combustible',            'ej: Inyección FI'],
                    ['rendimiento',    'Rendimiento',            'ej: 45 km/l'],
                    ['velocidad_max',  'Velocidad máx.',         'ej: 140 km/h'],
                    ['garantia',       'Garantía',               'ej: 2 años / 20,000 km'],
                    ['caracteristica', 'Característica',         'ej: Smart Key'],
                  ] as [keyof typeof NUEVA_MOTO_VACIA, string, string][]).map(([k, label, ph]) => (
                    <div key={k} className={k === 'tagline_venta' ? 'col-span-2' : ''}>
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
                <span className="text-xs text-gray-400">Las fotos y specs se editan en la tarjeta del vehículo</span>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNuevaMoto(true)}
              className="w-full py-3 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 hover:text-blue-800 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Agregar nuevo vehículo
            </button>
          )}
        </div>
      </SeccionColapsable>

      {/* ── Inventario de motos ── */}
      <SeccionColapsable titulo="Inventario de motos" icono="📦" defaultOpen={false}>
        <InventarioMotosConfig />
      </SeccionColapsable>

      {/* ── Categorías de pago ── */}
      <SeccionColapsable titulo="Categorías de pago" icono="🏷️" badge={categoriasPago.filter(c => c.activa).length} defaultOpen={false}>
        <div className="p-5">
          {categoriasPago.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400 mb-3">Sin categorías. Puedes agregar las predeterminadas o crear las tuyas.</p>
              <button onClick={sembrarCategoriasPago}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200 transition-colors">
                Cargar categorías predeterminadas
              </button>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {categoriasPago.map(cat => (
                <div key={cat.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${!cat.activa ? 'opacity-60 border-gray-100' : 'border-gray-200'}`}>
                  {editandoCatId === cat.id ? (
                    <>
                      <input value={editandoCatNombre} onChange={e => setEditandoCatNombre(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && guardarEditCategoria(cat.id)}
                        className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={() => guardarEditCategoria(cat.id)} className="text-green-600 hover:text-green-700 text-xs font-semibold">✓</button>
                      <button onClick={() => setEditandoCatId(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-gray-800">{cat.nombre}</span>
                      <button onClick={() => { setEditandoCatId(cat.id); setEditandoCatNombre(cat.nombre) }}
                        className="text-blue-400 hover:text-blue-600 text-xs">Editar</button>
                      <ToggleSwitch activo={cat.activa} onChange={() => toggleCategoriaPago(cat.id, cat.activa)} />
                      <button onClick={() => eliminarCategoriaPago(cat.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <input value={nuevaCategoriaPago} onChange={e => setNuevaCategoriaPago(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarCategoriaPago()}
              placeholder="ej: Subsidio vivienda"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={agregarCategoriaPago} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">+ Agregar</button>
          </div>
        </div>
      </SeccionColapsable>

      {/* ── Entidades financieras ── */}
      <SeccionColapsable titulo="Entidades financieras" icono="🏦" badge={entidades.filter(e => e.activa).length} defaultOpen={false}>
        <div className="p-5">
          <div className="space-y-2 mb-3">
            {entidades.map((e, i) => (
              <div key={e.id} className={`rounded-lg border px-3 py-2 ${!e.activa ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
                {editandoEntidadId === e.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editandoEntidadNombre}
                      onChange={ev => setEditandoEntidadNombre(ev.target.value)}
                      onKeyDown={ev => { if (ev.key === 'Enter') renombrarEntidad(); if (ev.key === 'Escape') { setEditandoEntidadId(null); setEditandoEntidadNombre('') } }}
                      className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={renombrarEntidad} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Guardar</button>
                    <button onClick={() => { setEditandoEntidadId(null); setEditandoEntidadNombre('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col -my-1">
                      <button onClick={() => moverEntidad(e.id, -1)} disabled={i === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed leading-none" title="Subir">▲</button>
                      <button onClick={() => moverEntidad(e.id, 1)} disabled={i === entidades.length - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed leading-none" title="Bajar">▼</button>
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-800">{e.nombre}</span>
                    <button onClick={() => { setEditandoEntidadId(e.id); setEditandoEntidadNombre(e.nombre) }} className="text-xs text-blue-500 hover:text-blue-700">Editar</button>
                    <ToggleSwitch activo={e.activa} onChange={() => toggleEntidad(e.id, e.activa)} />
                    <button onClick={() => eliminarEntidad(e.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={nuevaEntidad} onChange={e => setNuevaEntidad(e.target.value)} placeholder="ej: Bancolombia"
              onKeyDown={e => { if (e.key === 'Enter') agregarEntidad() }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={agregarEntidad} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">+ Agregar</button>
          </div>
        </div>
      </SeccionColapsable>

      {/* ── Bonos ── */}
      <SeccionColapsable titulo="Bonos" icono="🎁" badge={bonos.filter(b => b.activa).length} defaultOpen={false}>
        <div className="p-5">
          {bonos.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400 mb-3">Sin bonos. Puedes agregar los predeterminados o crear los tuyos.</p>
              <button onClick={sembrarBonos}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200 transition-colors">
                Cargar bonos predeterminados
              </button>
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {bonos.map(b => (
                <div key={b.id} className={`rounded-lg border px-3 py-2 ${!b.activa ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
                  {editandoBonoId === b.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editandoBonoNombre}
                        onChange={ev => setEditandoBonoNombre(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') renombrarBono(); if (ev.key === 'Escape') { setEditandoBonoId(null); setEditandoBonoNombre('') } }}
                        className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={renombrarBono} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Guardar</button>
                      <button onClick={() => { setEditandoBonoId(null); setEditandoBonoNombre('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-gray-800">{b.nombre}</span>
                      <button onClick={() => { setEditandoBonoId(b.id); setEditandoBonoNombre(b.nombre) }} className="text-xs text-blue-500 hover:text-blue-700">Editar</button>
                      <ToggleSwitch activo={b.activa} onChange={() => toggleBono(b.id, b.activa)} />
                      <button onClick={() => eliminarBono(b.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={nuevoBono} onChange={e => setNuevoBono(e.target.value)} placeholder="ej: Financiera"
              onKeyDown={e => { if (e.key === 'Enter') agregarBono() }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={agregarBono} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">+ Agregar</button>
          </div>
        </div>
      </SeccionColapsable>

      {/* ── Recordatorios automáticos ── */}
      <SeccionColapsable titulo="Recordatorios automáticos" icono="🔔" defaultOpen={false}>
        <div className="p-5">
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
        </div>
      </SeccionColapsable>

      {/* ── Plantillas de correo ── */}
      <SeccionColapsable titulo="Plantillas de correo" icono="✉️" badge={plantillas.length} defaultOpen={false}>
        <div className="p-5">
          <p className="text-xs text-gray-400 mb-3">
            Variables disponibles: {VARIABLES_CORREO.map(v => `{${v.clave}}`).join(' ')} — ej: &quot;Solicitud Matrícula ({'{Placa}'})&quot;.
            Se envían desde el correo de la empresa (Bot Colaboradores → Correo de la empresa).
          </p>
          <div className="space-y-2 mb-3">
            {plantillas.map(p => (
              <div key={p.id} className={`rounded-lg border px-3 py-2 ${!p.activa ? 'opacity-60' : 'border-gray-200'}`}>
                {editandoPlantillaId === p.id ? (
                  <div className="space-y-1.5">
                    <input value={editandoPlantilla.nombre} onChange={e => setEditandoPlantilla(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre interno"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input value={editandoPlantilla.destinatario} onChange={e => setEditandoPlantilla(v => ({ ...v, destinatario: e.target.value }))} placeholder="Destinatario (correo)"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input value={editandoPlantilla.asunto} onChange={e => setEditandoPlantilla(v => ({ ...v, asunto: e.target.value }))} placeholder="Asunto del correo"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <textarea value={editandoPlantilla.cuerpo_html} onChange={e => setEditandoPlantilla(v => ({ ...v, cuerpo_html: e.target.value }))}
                      placeholder="Cuerpo del correo" rows={4}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    {catalogoDocumentos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {catalogoDocumentos.map(tipo => {
                          const activo = editandoPlantilla.documentos_adjuntos.has(tipo)
                          return (
                            <button key={tipo} type="button"
                              onClick={() => setEditandoPlantilla(v => {
                                const next = new Set(v.documentos_adjuntos)
                                if (next.has(tipo)) next.delete(tipo); else next.add(tipo)
                                return { ...v, documentos_adjuntos: next }
                              })}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                activo ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                              }`}>
                              {tipo}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={editandoPlantilla.bloquear_si_falta_documento}
                        onChange={e => setEditandoPlantilla(v => ({ ...v, bloquear_si_falta_documento: e.target.checked }))} />
                      Bloquear el envío si al cliente le falta subir alguno de los documentos marcados arriba
                    </label>
                    <div className="flex gap-1.5">
                      <button onClick={guardarEditarPlantilla} className="flex-1 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold">Guardar</button>
                      <button onClick={() => setEditandoPlantillaId(null)} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-semibold text-gray-800">{p.nombre}</span>
                      <button onClick={() => abrirEditarPlantilla(p)} className="text-blue-600 hover:text-blue-800 text-xs">Editar</button>
                      <ToggleSwitch activo={p.activa} onChange={() => togglePlantilla(p.id, p.activa)} />
                      <button onClick={() => eliminarPlantilla(p.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Asunto: {p.asunto}</p>
                    <p className="text-xs text-gray-400">Para: {p.destinatario || '—'}</p>
                    {!!p.documentos_adjuntos?.length && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        📎 {p.documentos_adjuntos.join(', ')}
                        {p.bloquear_si_falta_documento && <span className="text-amber-600 font-semibold"> · bloquea si falta</span>}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Nueva plantilla</p>
            <input value={nuevaPlantilla.nombre} onChange={e => setNuevaPlantilla(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre interno"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={nuevaPlantilla.destinatario} onChange={e => setNuevaPlantilla(p => ({ ...p, destinatario: e.target.value }))} placeholder="Destinatario (correo)"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={nuevaPlantilla.asunto} onChange={e => setNuevaPlantilla(p => ({ ...p, asunto: e.target.value }))} placeholder="Asunto del correo — ej: Solicitud Matrícula ({Placa})"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <textarea value={nuevaPlantilla.cuerpo_html} onChange={e => setNuevaPlantilla(p => ({ ...p, cuerpo_html: e.target.value }))}
              placeholder="Cuerpo del correo. ej: Hola, adjunto documentos de {Nombre}, placa {Placa}..." rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            {catalogoDocumentos.length > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1">Documentos a adjuntar por defecto:</p>
                <div className="flex flex-wrap gap-1.5">
                  {catalogoDocumentos.map(tipo => {
                    const activo = nuevaPlantilla.documentos_adjuntos.has(tipo)
                    return (
                      <button key={tipo} type="button"
                        onClick={() => setNuevaPlantilla(p => {
                          const next = new Set(p.documentos_adjuntos)
                          if (next.has(tipo)) next.delete(tipo); else next.add(tipo)
                          return { ...p, documentos_adjuntos: next }
                        })}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                          activo ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                        }`}>
                        {tipo}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={nuevaPlantilla.bloquear_si_falta_documento}
                onChange={e => setNuevaPlantilla(p => ({ ...p, bloquear_si_falta_documento: e.target.checked }))} />
              Bloquear el envío si al cliente le falta subir alguno de los documentos marcados arriba
            </label>
            <button onClick={crearPlantilla} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
              + Crear plantilla
            </button>
          </div>
        </div>
      </SeccionColapsable>

      {/* ── Etiquetas de cliente ── */}
      <SeccionColapsable titulo="Pipelines y Etapas (beta)" icono="🧭" defaultOpen={false}>
        <PipelinesConfig usuarios={usuariosEquipo} />
      </SeccionColapsable>

      <SeccionColapsable titulo="Automatizaciones de Pipeline (beta)" icono="🔀" defaultOpen={false}>
        <ReglasPipelineConfig />
      </SeccionColapsable>

      <SeccionColapsable titulo="Etiquetas de cliente" icono="🏷️" badge={etiquetas.length} defaultOpen={false}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">Crea etiquetas para clasificar el origen o tipo de tus clientes. Puedes asignarlas automáticamente desde los flujos.</p>

          {/* Lista de etiquetas existentes */}
          {etiquetas.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No hay etiquetas creadas aún.</p>
          ) : (
            <div className="space-y-2">
              {etiquetas.map(et => (
                <div key={et.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  {editEtiqueta?.id === et.id ? (
                    <>
                      <input
                        type="color" value={editEtiqueta.color}
                        onChange={e => setEditEtiqueta(ed => ed ? { ...ed, color: e.target.value } : ed)}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                      />
                      <input
                        value={editEtiqueta.nombre}
                        onChange={e => setEditEtiqueta(ed => ed ? { ...ed, nombre: e.target.value } : ed)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={e => e.key === 'Enter' && guardarEdicionEtiqueta()}
                      />
                      <button onClick={guardarEdicionEtiqueta} className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800">Guardar</button>
                      <button onClick={() => setEditEtiqueta(null)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-300">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: et.color }} />
                      <span className="flex-1 text-sm font-medium text-gray-800">{et.nombre}</span>
                      <button onClick={() => setEditEtiqueta(et)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => { if (confirm(`¿Eliminar etiqueta "${et.nombre}"? Se quitará de todos los clientes.`)) eliminarEtiqueta(et.id) }}
                        className="text-xs text-red-500 hover:underline">Eliminar</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Crear nueva etiqueta */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-dashed border-gray-300">
            <p className="text-sm font-semibold text-gray-700">Nueva etiqueta</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="color" value={nuevaEtiqueta.color}
                  onChange={e => setNuevaEtiqueta(n => ({ ...n, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 p-0.5"
                  title="Color de la etiqueta"
                />
                <span className="text-xs text-gray-500">Color</span>
              </div>
              <input
                value={nuevaEtiqueta.nombre}
                onChange={e => setNuevaEtiqueta(n => ({ ...n, nombre: e.target.value }))}
                placeholder="Ej: Facebook Ads, Referido, WhatsApp"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && crearEtiqueta()}
              />
              <button
                onClick={crearEtiqueta}
                disabled={savingEtiqueta || !nuevaEtiqueta.nombre.trim()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {savingEtiqueta ? 'Creando…' : '+ Crear'}
              </button>
            </div>
          </div>
        </div>
      </SeccionColapsable>

      {/* ── APIs de Inteligencia Artificial ── */}
      <SeccionColapsable titulo="APIs de Inteligencia Artificial" icono="🔑" defaultOpen={false}>
        <div className="p-5 space-y-5">
          <p className="text-xs text-gray-500">Conecta tus cuentas de IA para usar agentes en los flujos de automatización. Las claves se almacenan cifradas.</p>

          {/* OpenAI */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🤖</span>
              <span className="font-semibold text-gray-800 text-sm">OpenAI (ChatGPT)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">API Key</label>
                <input
                  type="password"
                  value={configApis.openai_key}
                  onChange={e => setConfigApis(c => ({ ...c, openai_key: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Modelo por defecto</label>
                <select
                  value={configApis.openai_modelo}
                  onChange={e => setConfigApis(c => ({ ...c, openai_modelo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (económico)</option>
                  <option value="gpt-4o">gpt-4o (potente)</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo (rápido)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Anthropic */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🧠</span>
              <span className="font-semibold text-gray-800 text-sm">Anthropic (Claude)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">API Key</label>
                <input
                  type="password"
                  value={configApis.anthropic_key}
                  onChange={e => setConfigApis(c => ({ ...c, anthropic_key: e.target.value }))}
                  placeholder="sk-ant-..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Modelo por defecto</label>
                <select
                  value={configApis.anthropic_modelo}
                  onChange={e => setConfigApis(c => ({ ...c, anthropic_modelo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (rápido)</option>
                  <option value="claude-sonnet-5">claude-sonnet-5 (potente)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ElevenLabs */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🔊</span>
              <span className="font-semibold text-gray-800 text-sm">ElevenLabs (Notas de voz IA)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">API Key</label>
                <input
                  type="password"
                  value={configApis.elevenlabs_key}
                  onChange={e => setConfigApis(c => ({ ...c, elevenlabs_key: e.target.value }))}
                  placeholder="xi-..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Voice ID</label>
                <input
                  value={configApis.elevenlabs_voz_id}
                  onChange={e => setConfigApis(c => ({ ...c, elevenlabs_voz_id: e.target.value }))}
                  placeholder="ej: 21m00Tcm4TlvDq8ikWAM"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => guardarApis(configApis)}
              disabled={savingApis}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {savingApis ? 'Guardando…' : 'Guardar claves API'}
            </button>
            {apisOk && <span className="text-green-600 text-sm font-medium">✓ Guardado</span>}
          </div>
          <p className="text-xs text-gray-400">Los modelos más económicos (gpt-4o-mini, claude-haiku) ofrecen el mejor costo/rendimiento para atención al cliente.</p>
        </div>
      </SeccionColapsable>

      {/* ── Agentes IA ── */}
      <SeccionColapsable titulo="Agentes IA" icono="🤖" badge={agentes.length} defaultOpen={false}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">Configura agentes de IA para usar en los flujos de automatización. Cada agente tiene su propio prompt y comportamiento.</p>

          {/* Lista de agentes */}
          <div className="space-y-3">
            {agentes.map(ag => (
              <div key={ag.id} className={`border rounded-xl p-4 space-y-3 ${!ag.activo ? 'opacity-60 border-gray-100' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{ag.proveedor === 'openai' ? '🤖' : ag.proveedor === 'anthropic' ? '🧠' : '🔊'}</span>
                  {editAgente === ag.id ? (
                    <input
                      defaultValue={ag.nombre}
                      onBlur={e => actualizarAgente(ag.id, { nombre: e.target.value })}
                      className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <span className="flex-1 font-semibold text-gray-800 text-sm">{ag.nombre}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ag.proveedor === 'openai' ? 'bg-green-100 text-green-700' : ag.proveedor === 'anthropic' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                    {ag.proveedor}
                  </span>
                  <ToggleSwitch activo={ag.activo} onChange={() => actualizarAgente(ag.id, { activo: !ag.activo })} />
                  <button onClick={() => setEditAgente(editAgente === ag.id ? null : ag.id)} className="text-blue-500 hover:text-blue-700 text-xs px-2">
                    {editAgente === ag.id ? 'Cerrar' : 'Editar'}
                  </button>
                  <button onClick={() => eliminarAgente(ag.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                </div>

                {editAgente === ag.id && (
                  <div className="space-y-3 mt-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Proveedor</label>
                        <select
                          defaultValue={ag.proveedor}
                          onBlur={e => actualizarAgente(ag.id, { proveedor: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        >
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="elevenlabs">ElevenLabs</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Modelo (opcional)</label>
                        <input
                          defaultValue={ag.modelo ?? ''}
                          onBlur={e => actualizarAgente(ag.id, { modelo: e.target.value || null })}
                          placeholder="Usa el modelo por defecto"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Temperatura</label>
                          <input
                            type="number" min={0} max={2} step={0.1}
                            defaultValue={ag.temperatura}
                            onBlur={e => actualizarAgente(ag.id, { temperatura: parseFloat(e.target.value) || 0.7 })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Max tokens</label>
                          <input
                            type="number" min={100} max={4000} step={100}
                            defaultValue={ag.max_tokens}
                            onBlur={e => actualizarAgente(ag.id, { max_tokens: parseInt(e.target.value) || 800 })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Prompt del sistema (comportamiento del agente)</label>
                      <textarea
                        defaultValue={ag.prompt_sistema ?? ''}
                        onBlur={e => actualizarAgente(ag.id, { prompt_sistema: e.target.value || null })}
                        placeholder="Eres un asesor de ventas de motos amable y profesional..."
                        rows={4}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Instrucciones de acción (qué hacer según el contexto)</label>
                      <textarea
                        defaultValue={ag.instrucciones ?? ''}
                        onBlur={e => actualizarAgente(ag.id, { instrucciones: e.target.value || null })}
                        placeholder="Si el cliente pregunta por precios, menciona las opciones disponibles. Si quiere agendar, captura fecha y hora..."
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <p className="text-xs text-gray-400">El agente recibe automáticamente: nombre del cliente, historial reciente, etapa actual y canal de comunicación.</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Formulario nuevo agente */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Nuevo agente IA</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={nuevoAgente.nombre}
                onChange={e => setNuevoAgente(a => ({ ...a, nombre: e.target.value }))}
                placeholder="Nombre del agente (ej: Asesor Principal)"
                className="md:col-span-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={nuevoAgente.proveedor}
                onChange={e => setNuevoAgente(a => ({ ...a, proveedor: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </div>
            <textarea
              value={nuevoAgente.prompt_sistema}
              onChange={e => setNuevoAgente(a => ({ ...a, prompt_sistema: e.target.value }))}
              placeholder="Prompt del sistema: describe cómo debe comportarse el agente..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <textarea
              value={nuevoAgente.instrucciones}
              onChange={e => setNuevoAgente(a => ({ ...a, instrucciones: e.target.value }))}
              placeholder="Instrucciones adicionales: qué hacer en cada situación..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={crearAgente}
              disabled={savingAgente || !nuevoAgente.nombre.trim()}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {savingAgente ? 'Creando…' : '+ Crear agente IA'}
            </button>
          </div>
        </div>
      </SeccionColapsable>

      {/* ── Asesores asignables en ventas ── */}
      <SeccionColapsable titulo="Asesores asignables en ventas" icono="👥" defaultOpen={false}>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-400">
            Activa o desactiva quién aparece como opción al asignar un asesor en Seguimiento Ventas. Solo los usuarios con este switch activo aparecen en el filtro y en el desplegable de asignación.
          </p>
          {usuariosEquipo.length === 0 ? (
            <p className="text-sm text-gray-400">Cargando usuarios...</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {usuariosEquipo.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.nombre ?? u.email ?? 'Usuario sin nombre'}
                    </p>
                    {u.nombre && u.email && (
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleAsesor(u.id, u.es_asesor)}
                    disabled={togglingAsesor === u.id}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                      u.es_asesor ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    title={u.es_asesor ? 'Desactivar como asesor asignable' : 'Activar como asesor asignable'}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      u.es_asesor ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SeccionColapsable>

      {/* ── Archivos de clientes en Drive ── */}
      <SeccionColapsable titulo="Archivos de clientes en Drive" icono="📁" defaultOpen={false}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-400">
            Vincula una carpeta de Google Drive donde se guardarán los archivos que subas en la pestaña <strong>Archivos</strong> de cada cliente en Seguimiento Ventas. Se crea automáticamente una subcarpeta por cliente dentro de esta carpeta.
          </p>

          {!driveConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800">Google Drive no conectado</p>
              <p className="text-xs text-amber-700 mt-1">Conecta tu cuenta de Google para habilitar el almacenamiento de archivos en Drive.</p>
              <a href="/api/drive/connect?redirect_to=config-ventas"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors">
                Conectar Google Drive
              </a>
            </div>
          )}

          {driveConnected && (
            <div className="space-y-3">
              {ventasFolderConfigured && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-green-600 text-lg flex-shrink-0">✓</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-green-800">Carpeta configurada</p>
                    <p className="text-[10px] text-green-700 font-mono truncate">{ventasFolderConfigured}</p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">URL de la carpeta en Google Drive</label>
                <input
                  value={ventasFolderUrl}
                  onChange={e => setVentasFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-gray-400 mt-1">Abre la carpeta en Google Drive, copia la URL completa y pégala aquí.</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={async () => {
                    setSavingDrive(true)
                    const res = await fetch('/api/admin/ventas/config-drive', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ folder_url: ventasFolderUrl }),
                    })
                    const d = await res.json()
                    setSavingDrive(false)
                    if (res.ok) {
                      setVentasFolderConfigured(d.folder_id)
                      setDriveOk(true)
                      setTimeout(() => setDriveOk(false), 2500)
                    } else {
                      alert('Error: ' + (d.error ?? 'Error desconocido'))
                    }
                  }}
                  disabled={savingDrive || !ventasFolderUrl.trim()}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {savingDrive ? 'Guardando...' : 'Guardar carpeta'}
                </button>
                {driveOk && <span className="text-xs text-green-600 font-semibold">✓ Guardado</span>}
              </div>

              {ventasFolderConfigured && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500 mb-2">
                    Mueve los archivos existentes (guardados antes de vincular Drive) a sus carpetas por cliente en Drive y libera espacio en R2.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        setMigrando(true); setMigrMsg(null)
                        const res = await fetch('/api/admin/ventas/archivos/migrar-a-drive', { method: 'POST' })
                        const d = await res.json()
                        setMigrando(false)
                        if (res.ok) {
                          setMigrMsg(d.migrated === 0
                            ? 'Todo ya estaba en Drive ✓'
                            : `${d.migrated} de ${d.total} archivo(s) movidos a Drive ✓`)
                        } else {
                          setMigrMsg('Error: ' + (d.error ?? 'desconocido'))
                        }
                      }}
                      disabled={migrando}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      {migrando ? 'Sincronizando...' : 'Sincronizar archivos existentes a Drive'}
                    </button>
                    {migrMsg && (
                      <span className={`text-xs font-medium ${migrMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                        {migrMsg}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SeccionColapsable>
    </div>
  )
}
