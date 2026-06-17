'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { ClienteMotoPanel } from '@/components/ClienteMotoPanel'
import { normalizarPlaca } from '@/lib/utils'
import { upsertMotoCliente } from '@/lib/clienteMoto'
import type { ClienteMotoPanelResult } from '@/components/ClienteMotoPanel'

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp', '.m4v', '.wmv', '.flv', '.ts'])
const isVideoFile = (file: File): boolean =>
  file.type.startsWith('video/') ||
  VIDEO_EXTENSIONS.has('.' + (file.name.split('.').pop() ?? '').toLowerCase())

const DRAFT_KEY = 'optiDesk_recepcion_draft'
const PANEL_INIT: ClienteMotoPanelResult = { motoId: null, clienteId: null, motoExtras: { marca: '', modelo: '', año: '', color: '', kilometraje: '' }, isKnownMoto: false }

const formatTelefono = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function RecepcionPage() {
  const params = useParams()
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [placa, setPlaca] = useState(params.placa === 'nueva' ? '' : String(params.placa))
  const [cliente, setCliente] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaIds, setSubcategoriaIds] = useState<string[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [archivos, setArchivos] = useState<File[]>([])
  const [previews, setPreviews] = useState<{ url: string; tipo: 'imagen' | 'video' }[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const [panelResult, setPanelResult] = useState<ClienteMotoPanelResult>(PANEL_INIT)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (params.placa !== 'nueva') return
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.placa) setPlaca(d.placa)
        if (d.cliente) setCliente(d.cliente)
        if (d.telefono) setTelefono(d.telefono)
        if (d.descripcion) setDescripcion(d.descripcion)
        if (d.categoriaId) setCategoriaId(d.categoriaId)
        if (d.subcategoriaIds) setSubcategoriaIds(d.subcategoriaIds)
      }
    } catch { /* borrador inválido */ }
  }, [params.placa])

  useEffect(() => {
    if (params.placa !== 'nueva') return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ placa, cliente, telefono, descripcion, categoriaId, subcategoriaIds }))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 1500)
    }, 800)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [placa, cliente, telefono, descripcion, categoriaId, subcategoriaIds, params.placa])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase
      .from('categorias_servicio')
      .select('id, nombre, subcategorias_servicio(id, nombre)')
      .eq('tenant_id', profile.tenant_id)
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => setCategorias((data as Categoria[]) ?? []))
  }, [profile?.tenant_id])

  const subcategorias = categorias.find((c) => c.id === categoriaId)?.subcategorias_servicio ?? []

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const rechazados: string[] = []
    const validos = files.filter((f) => {
      if (isVideoFile(f) && f.size > 200 * 1024 * 1024) {
        rechazados.push(`${f.name} (máx 200 MB para videos)`)
        return false
      }
      if (!isVideoFile(f) && f.size > 20 * 1024 * 1024) {
        rechazados.push(`${f.name} (máx 20 MB para fotos)`)
        return false
      }
      return true
    })
    if (rechazados.length) setError(`Archivos rechazados: ${rechazados.join(', ')}`)
    setArchivos((prev) => [...prev, ...validos])
    validos.forEach((f) => {
      setPreviews((prev) => [...prev, { url: URL.createObjectURL(f), tipo: isVideoFile(f) ? 'video' : 'imagen' }])
    })
    // Limpiar el input para permitir re-seleccionar el mismo archivo
    e.target.value = ''
  }

  const removeFile = (idx: number) => {
    URL.revokeObjectURL(previews[idx].url)
    setArchivos((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile?.tenant_id || !profile.id) return
    setError('')
    setSaving(true)

    try {
      const placaNorm = normalizarPlaca(placa)

      const { data: activa } = await supabase
        .from('ordenes')
        .select('numero')
        .eq('tenant_id', profile.tenant_id)
        .eq('placa', placaNorm)
        .in('estado', ['falta_revision', 'en_proceso', 'pendiente'])
        .maybeSingle()

      if (activa) {
        setError(`Esta moto ya tiene una orden activa (#${(activa as { numero: number }).numero}). Debe ser confirmada o cerrada antes de abrir otra.`)
        setSaving(false)
        return
      }

      // Crear/vincular moto y cliente silenciosamente
      const { motoId, clienteId } = await upsertMotoCliente({
        supabase, tenantId: profile.tenant_id,
        placa: placaNorm, clienteNombre: cliente, celular: telefono || null,
        motoId: panelResult.motoId, clienteId: panelResult.clienteId,
        motoExtras: panelResult.motoExtras,
      })

      const { data: orden, error: ordenErr } = await supabase
        .from('ordenes')
        .insert({
          tenant_id: profile.tenant_id,
          placa: placaNorm,
          cliente,
          telefono: telefono || null,
          descripcion,
          categoria_servicio_id: categoriaId || null,
          subcategoria_servicio_id: subcategoriaIds[0] || null,
          subcategoria_servicio_ids: subcategoriaIds,
          mecanico_id: profile.id,
          estado: 'falta_revision',
          numero: 0,
          moto_id: motoId,
          cliente_id: clienteId,
        })
        .select('id')
        .single()

      if (ordenErr || !orden) throw ordenErr ?? new Error('No se pudo crear la orden')

      const erroresUpload: string[] = []
      for (let i = 0; i < archivos.length; i++) {
        const file = archivos[i]
        const esVideo = isVideoFile(file)
        setUploadProgress(`Subiendo ${esVideo ? 'video' : 'foto'} ${i + 1} de ${archivos.length}...`)
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('orden_id', (orden as { id: string }).id)
          formData.append('tipo', esVideo ? 'video' : 'imagen')
          const res = await fetch('/api/upload', { method: 'POST', body: formData })
          if (!res.ok) {
            const j = await res.json().catch(() => ({}))
            erroresUpload.push(j.error ?? `Error al subir ${file.name}`)
          }
        } catch {
          erroresUpload.push(`No se pudo subir ${file.name}`)
        }
      }
      setUploadProgress('')

      localStorage.removeItem(DRAFT_KEY)
      if (erroresUpload.length) {
        setError(`Orden creada, pero ${erroresUpload.join('; ')}`)
        setSaving(false)
        return
      }
      router.push('/mecanico')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">Nueva recepción</h1>
        {draftSaved && <span className="text-xs text-green-600 ml-auto">Borrador guardado</span>}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Placa *</label>
          <input
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ABC123"
            maxLength={10}
          />
        </div>

        {/* Panel inteligente de moto */}
        {profile?.tenant_id && (
          <ClienteMotoPanel
            tenantId={profile.tenant_id}
            placa={placa}
            onAutoFill={({ nombre, celular }) => {
              if (nombre) setCliente(nombre)
              if (celular && !telefono) setTelefono(celular)
            }}
            onResult={setPanelResult}
          />
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
          <input
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nombre del cliente"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Celular (opcional)</label>
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(formatTelefono(e.target.value))}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="(310) 000-0000"
          />
        </div>

        {/* Selección rápida de tipo de ingreso */}
        {categorias.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de ingreso</label>
            <div className="flex flex-wrap gap-2">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCategoriaId(categoriaId === c.id ? '' : c.id); setSubcategoriaIds([]) }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                    categoriaId === c.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                  }`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {subcategorias.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subcategoría</label>
            <div className="flex flex-wrap gap-2">
              {subcategorias.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSubcategoriaIds(prev =>
                    prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                  )}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                    subcategoriaIds.includes(s.id)
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                  }`}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción del trabajo</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Describe el trabajo a realizar..."
          />
        </div>


        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fotos y videos</label>
          <div className="grid grid-cols-2 gap-2">
            {/* Botón cámara — abre la cámara directamente (funciona en Android e iPhone) */}
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-blue-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors bg-white">
              <svg className="w-6 h-6 text-blue-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-blue-600 font-medium">Cámara</span>
              <input type="file" accept="image/*,video/*" capture="environment" onChange={handleFileChange} className="hidden" />
            </label>
            {/* Botón galería — abre el selector de archivos */}
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors bg-white">
              <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs text-gray-500 font-medium">Galería</span>
              <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="hidden" />
            </label>
          </div>
          {previews.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {previews.map((p, i) => (
                <div key={i} className="relative aspect-square">
                  {p.tipo === 'imagen'
                    ? <img src={p.url} alt="" className="w-full h-full object-cover rounded-lg" />
                    : <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                  }
                  <button type="button" onClick={() => removeFile(i)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={saving}>
          {uploadProgress || 'Guardar recepción'}
        </Button>
      </form>
    </div>
  )
}
