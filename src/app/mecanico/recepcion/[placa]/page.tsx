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

const DRAFT_KEY = 'optiDesk_recepcion_draft'
const PANEL_INIT: ClienteMotoPanelResult = { motoId: null, clienteId: null, motoExtras: { marca: '', modelo: '', año: '', color: '' }, isKnownMoto: false }

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
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [archivos, setArchivos] = useState<File[]>([])
  const [previews, setPreviews] = useState<{ url: string; tipo: 'imagen' | 'video' }[]>([])
  const [saving, setSaving] = useState(false)
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
        if (d.subcategoriaId) setSubcategoriaId(d.subcategoriaId)
      }
    } catch { /* borrador inválido */ }
  }, [params.placa])

  useEffect(() => {
    if (params.placa !== 'nueva') return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ placa, cliente, telefono, descripcion, categoriaId, subcategoriaId }))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 1500)
    }, 800)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [placa, cliente, telefono, descripcion, categoriaId, subcategoriaId, params.placa])

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
    const validos = files.filter((f) =>
      !(f.type.startsWith('video/') && f.size > 500 * 1024 * 1024) &&
      !(f.type.startsWith('image/') && f.size > 20 * 1024 * 1024)
    )
    setArchivos((prev) => [...prev, ...validos])
    validos.forEach((f) => {
      setPreviews((prev) => [...prev, { url: URL.createObjectURL(f), tipo: f.type.startsWith('video/') ? 'video' : 'imagen' }])
    })
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
          subcategoria_servicio_id: subcategoriaId || null,
          mecanico_id: profile.id,
          estado: 'falta_revision',
          numero: 0,
          moto_id: motoId,
          cliente_id: clienteId,
        })
        .select('id')
        .single()

      if (ordenErr || !orden) throw ordenErr ?? new Error('No se pudo crear la orden')

      for (const file of archivos) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('orden_id', (orden as { id: string }).id)
        formData.append('tipo', file.type.startsWith('video/') ? 'video' : 'imagen')
        await fetch('/api/upload', { method: 'POST', body: formData })
      }

      localStorage.removeItem(DRAFT_KEY)
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
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="310 000 0000"
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
                  onClick={() => { setCategoriaId(categoriaId === c.id ? '' : c.id); setSubcategoriaId('') }}
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
            <select
              value={subcategoriaId}
              onChange={(e) => setSubcategoriaId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar</option>
              {subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
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
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors bg-gray-50">
            <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs text-gray-500">Toca para agregar fotos/videos</span>
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="hidden" />
          </label>
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
          Guardar recepción
        </Button>
      </form>
    </div>
  )
}
