'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { ClienteMotoPanel } from '@/components/ClienteMotoPanel'
import { BuscarClienteModal } from '@/components/BuscarClienteModal'
import { normalizarPlaca } from '@/lib/utils'
import { upsertMotoCliente } from '@/lib/clienteMoto'
import { subirArchivoOrden } from '@/lib/clientUpload'
import type { ClienteMotoPanelResult } from '@/components/ClienteMotoPanel'
import type { ClienteEncontrado } from '@/components/BuscarClienteModal'

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

const DRAFT_KEY = 'optiDesk_admin_orden_draft'
const PANEL_INIT: ClienteMotoPanelResult = { motoId: null, clienteId: null, motoExtras: { marca: '', modelo: '', año: '', color: '', kilometraje: '' }, isKnownMoto: false }

const formatTelefono = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function NuevaOrdenAdminPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [placa, setPlaca] = useState('')
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cedula, setCedula] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [manifiestaCliente, setManifiestaCliente] = useState('')
  const [diagnostico, setDiagnostico] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaIds, setSubcategoriaIds] = useState<string[]>([])
  const [tipoServicio, setTipoServicio] = useState<'terceros' | 'uma' | ''>('')
  const [numeroOt, setNumeroOt] = useState('')
  const [numerosOrdenUMA, setNumerosOrdenUMA] = useState<string[]>([])
  const [nuevoNumOrden, setNuevoNumOrden] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [archivos, setArchivos] = useState<File[]>([])
  const [previews, setPreviews] = useState<{ url: string; tipo: 'imagen' | 'video' }[]>([])
  const [tipoOrden, setTipoOrden] = useState<'servicio' | 'venta_repuestos'>('servicio')
  const [esProgramada, setEsProgramada] = useState(false)
  const [fechaProgramada, setFechaProgramada] = useState('')
  const [duracionEstimada, setDuracionEstimada] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const [panelResult, setPanelResult] = useState<ClienteMotoPanelResult>(PANEL_INIT)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [clienteIdSeleccionado, setClienteIdSeleccionado] = useState<string | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.placa) setPlaca(d.placa)
        if (d.cliente) setCliente(d.cliente)
        if (d.telefono) setTelefono(d.telefono)
        if (d.cedula) setCedula(d.cedula)
        if (d.descripcion) setDescripcion(d.descripcion)
        if (d.manifiestaCliente) setManifiestaCliente(d.manifiestaCliente)
        if (d.diagnostico) setDiagnostico(d.diagnostico)
        if (d.categoriaId) setCategoriaId(d.categoriaId)
        if (d.subcategoriaIds) setSubcategoriaIds(d.subcategoriaIds)
        if (d.tipoServicio) setTipoServicio(d.tipoServicio)
        if (d.numeroOt) setNumeroOt(d.numeroOt)
        if (d.numerosOrdenUMA) setNumerosOrdenUMA(d.numerosOrdenUMA)
        if (d.esProgramada) setEsProgramada(d.esProgramada)
        if (d.fechaProgramada) setFechaProgramada(d.fechaProgramada)
        if (d.duracionEstimada) setDuracionEstimada(d.duracionEstimada)
      }
    } catch { /* borrador inválido */ }
  }, [])

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ placa, cliente, telefono, cedula, descripcion, manifiestaCliente, diagnostico, categoriaId, subcategoriaIds, tipoServicio, numeroOt, numerosOrdenUMA, esProgramada, fechaProgramada, duracionEstimada }))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 1500)
    }, 800)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [placa, cliente, telefono, cedula, descripcion, manifiestaCliente, diagnostico, categoriaId, subcategoriaIds, tipoServicio, numeroOt, numerosOrdenUMA, esProgramada, fechaProgramada, duracionEstimada])

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

  function seleccionarCliente(c: ClienteEncontrado) {
    setCliente(c.nombre)
    if (c.cedula)  setCedula(c.cedula)
    if (c.celular) setTelefono(c.celular)
    setClienteIdSeleccionado(c.id)
    setBuscandoCliente(false)
  }

  const subcategorias = categorias.find((c) => c.id === categoriaId)?.subcategorias_servicio ?? []
  const esUMACategoria = categorias.find(c => c.id === categoriaId)?.nombre?.toLowerCase().includes('uma') ?? false
  // Solo categorías UMA aquí — si se mostraran todas, junto al toggle de
  // "Tipo de servicio" de arriba parecía preguntar dos veces UMA/Terceros.
  const categoriasUma = categorias.filter((c) => c.nombre.toLowerCase().includes('uma'))
  const esGarantia = subcategorias.some((s) => subcategoriaIds.includes(s.id) && s.nombre.toLowerCase().includes('garant'))

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
    if (!profile?.tenant_id) return
    if (tipoOrden === 'servicio' && esProgramada && !fechaProgramada) {
      setError('Ingresa la fecha y hora de la cita programada.')
      return
    }
    if (tipoOrden === 'servicio' && !tipoServicio) {
      setError('Selecciona el tipo de servicio: UMA o Terceros.')
      return
    }
    if (tipoOrden === 'servicio' && tipoServicio === 'uma' && !categoriaId) {
      setError('Selecciona el subtipo de servicio UMA.')
      return
    }
    setError('')
    setSaving(true)

    try {
      const placaNorm = normalizarPlaca(placa)

      if (placaNorm && tipoOrden === 'servicio') {
        const { data: activa } = await supabase
          .from('ordenes')
          .select('numero')
          .eq('tenant_id', profile.tenant_id)
          .eq('placa', placaNorm)
          .in('estado', ['programado', 'falta_revision', 'en_proceso', 'pendiente'])
          .maybeSingle()

        if (activa) {
          setError(`Esta moto ya tiene una orden activa (#${(activa as { numero: number }).numero}). Ciérrala antes de abrir otra.`)
          setSaving(false)
          return
        }
      }

      const { motoId, clienteId } = await upsertMotoCliente({
        supabase, tenantId: profile.tenant_id,
        placa: placaNorm || null, clienteNombre: cliente,
        cedula: cedula || null, celular: telefono || null,
        motoId: panelResult.motoId,
        clienteId: clienteIdSeleccionado ?? panelResult.clienteId,
        motoExtras: panelResult.motoExtras,
      })

      const { data: orden, error: ordenErr } = await supabase
        .from('ordenes')
        .insert({
          tenant_id: profile.tenant_id,
          placa: placaNorm || null,
          cliente: cliente || '—',
          telefono: telefono || null,
          cedula: cedula || null,
          descripcion: esGarantia ? null : descripcion,
          manifiesta_cliente: esGarantia ? manifiestaCliente || null : null,
          diagnostico: esGarantia ? diagnostico || null : null,
          categoria_servicio_id: categoriaId || null,
          subcategoria_servicio_id: subcategoriaIds[0] || null,
          subcategoria_servicio_ids: subcategoriaIds,
          tipo_orden: tipoOrden,
          tipo_servicio: tipoOrden === 'servicio' ? tipoServicio : 'terceros',
          numero_ot: tipoServicio === 'uma' ? (numeroOt || null) : null,
          numeros_orden_uma: esUMACategoria ? numerosOrdenUMA : [],
          mecanico_id: profile.id,
          estado: tipoOrden === 'servicio' && esProgramada ? 'programado' : 'en_proceso',
          fecha_programada: tipoOrden === 'servicio' && esProgramada && fechaProgramada ? new Date(fechaProgramada).toISOString() : null,
          duracion_estimada_horas: tipoOrden === 'servicio' && esProgramada && duracionEstimada ? parseFloat(duracionEstimada) : null,
          numero: 0,
          moto_id: motoId,
          cliente_id: clienteId,
        })
        .select('id')
        .single()

      if (ordenErr || !orden) throw ordenErr ?? new Error('No se pudo crear la orden')

      const erroresUpload: string[] = []
      for (const file of archivos) {
        try {
          await subirArchivoOrden({
            ordenId: (orden as { id: string }).id,
            file,
            tipo: file.type.startsWith('video/') ? 'video' : 'imagen',
          })
        } catch (e) {
          erroresUpload.push(e instanceof Error ? e.message : `No se pudo subir ${file.name}`)
        }
      }

      localStorage.removeItem(DRAFT_KEY)
      if (erroresUpload.length) {
        setError(`Orden creada, pero ${erroresUpload.join('; ')}`)
        setSaving(false)
        return
      }
      router.push(`/admin/ordenes/${(orden as { id: string }).id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {tipoOrden === 'venta_repuestos' ? 'Nueva venta de repuesto' : 'Nueva orden de servicio'}
        </h1>
        {draftSaved && <span className="text-xs text-green-600 ml-auto">Borrador guardado</span>}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Tipo de entrada */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Tipo de entrada</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setTipoOrden('servicio')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${tipoOrden === 'servicio' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              🔧 Servicio técnico
            </button>
            <button type="button" onClick={() => setTipoOrden('venta_repuestos')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${tipoOrden === 'venta_repuestos' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              🛒 Venta de repuesto
            </button>
          </div>
        </div>

        {/* ¿Cuándo se realiza el servicio? (solo servicio técnico) */}
        {tipoOrden === 'servicio' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">¿Cuándo se realiza el servicio?</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEsProgramada(false)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${!esProgramada ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                Ahora
              </button>
              <button type="button" onClick={() => setEsProgramada(true)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${esProgramada ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                📅 Programar para después
              </button>
            </div>
            {esProgramada && (
              <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-orange-700 mb-1">Fecha y hora de la cita *</label>
                  <input
                    type="datetime-local"
                    value={fechaProgramada}
                    onChange={(e) => setFechaProgramada(e.target.value)}
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-orange-700 mb-1">Duración estimada del servicio (horas)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={duracionEstimada}
                    onChange={(e) => setDuracionEstimada(e.target.value)}
                    placeholder="Ej: 1.5"
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tipo de servicio (solo servicio técnico) */}
        {tipoOrden === 'servicio' && (
          <div className={`bg-white rounded-xl border p-5 space-y-3 ${!tipoServicio ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200'}`}>
            <h2 className="font-semibold text-gray-900">Tipo de servicio *</h2>
            <div className="flex gap-2">
              {([
                { value: 'terceros', label: 'Terceros / Independiente' },
                { value: 'uma', label: 'UMA (Autorizado)' },
              ] as { value: 'terceros' | 'uma'; label: string }[]).map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setTipoServicio(t.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    tipoServicio === t.value
                      ? t.value === 'uma' ? 'bg-purple-700 text-white' : 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Datos del cliente / Moto */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">
            {tipoOrden === 'venta_repuestos' ? 'Datos del cliente (opcional)' : 'Moto y cliente'}
          </h2>

          {/* Placa y cédula — solo en servicio técnico */}
          {tipoOrden === 'servicio' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Placa</label>
                <input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase"
                  placeholder="ABC123"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cédula</label>
                <input
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Número de cédula"
                />
              </div>
            </div>
          )}

          {/* Panel inteligente moto + cliente (solo servicio técnico) */}
          {tipoOrden === 'servicio' && profile?.tenant_id && (
            <ClienteMotoPanel
              tenantId={profile.tenant_id}
              placa={placa}
              cedula={cedula}
              onAutoFill={({ nombre, cedula: cc, celular }) => {
                if (nombre && !cliente) setCliente(nombre)
                if (cc && !cedula) setCedula(cc)
                if (celular && !telefono) setTelefono(celular)
              }}
              onResult={setPanelResult}
            />
          )}

          {/* Nombre del cliente */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">
                  Cliente {tipoOrden === 'servicio' ? '*' : ''}
                </label>
                {profile?.tenant_id && (
                  <button
                    type="button"
                    onClick={() => setBuscandoCliente(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    🔍 Buscar existente
                  </button>
                )}
              </div>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                required={tipoOrden === 'servicio'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Nombre del cliente"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(formatTelefono(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${!telefono && tipoOrden === 'servicio' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                placeholder="(310) 000-0000"
              />
            </div>
          </div>

          {/* Cédula — solo para venta_repuestos (en servicio va arriba junto a placa) */}
          {tipoOrden === 'venta_repuestos' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cédula / ID</label>
              <input
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Número de cédula (opcional)"
              />
            </div>
          )}
        </div>

        {/* Servicio — categorías + # Orden UMA (solo servicio técnico UMA) */}
        {tipoOrden === 'servicio' && tipoServicio === 'uma' && (
          <div className="space-y-3">
            <div className={`bg-white rounded-xl border p-5 space-y-3 ${!categoriaId ? 'border-red-300 ring-2 ring-red-100' : 'border-purple-200'}`}>
              <h2 className="font-semibold text-gray-900">Subtipo de servicio UMA *</h2>
              <select
                value={categoriaId}
                onChange={(e) => { setCategoriaId(e.target.value); setSubcategoriaIds([]) }}
                className="w-full px-3 py-2 border border-purple-200 bg-purple-50 rounded-lg text-sm"
              >
                <option value="">Selecciona...</option>
                {categoriasUma.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {subcategorias.length > 0 && (
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
                          ? 'border-purple-600 bg-purple-600 text-white'
                          : 'border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400'
                      }`}
                    >
                      {s.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {esUMACategoria && <div className={`rounded-xl border p-5 space-y-3 transition-colors ${numerosOrdenUMA.length === 0 ? 'border-amber-300 bg-amber-50' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900"># Orden UMA</h2>
                {numerosOrdenUMA.length === 0 && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    ⚠ Importante: agrega el número de orden
                  </span>
                )}
              </div>
              {numerosOrdenUMA.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {numerosOrdenUMA.map((num, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                      <span className="font-mono text-sm font-semibold text-purple-800">{num}</span>
                      <button
                        type="button"
                        onClick={() => setNumerosOrdenUMA((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-purple-300 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={nuevoNumOrden}
                  onChange={(e) => setNuevoNumOrden(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const num = nuevoNumOrden.trim()
                      if (num && !numerosOrdenUMA.includes(num)) setNumerosOrdenUMA((prev) => [...prev, num])
                      setNuevoNumOrden('')
                    }
                  }}
                  placeholder="Ej: 349384"
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 ${numerosOrdenUMA.length === 0 ? 'border-amber-300 bg-white placeholder-amber-400' : 'border-gray-200'}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const num = nuevoNumOrden.trim()
                    if (!num || numerosOrdenUMA.includes(num)) return
                    setNumerosOrdenUMA((prev) => [...prev, num])
                    setNuevoNumOrden('')
                  }}
                  disabled={!nuevoNumOrden.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  + Agregar
                </button>
              </div>
              {numerosOrdenUMA.length === 0 && (
                <p className="text-xs text-amber-700">
                  El número de orden UMA es requerido para este tipo de ingreso. Puedes agregarlo ahora o más adelante en el detalle del caso.
                </p>
              )}
            </div>}
          </div>
        )}

        {/* Descripción del trabajo */}
        {esGarantia && tipoOrden !== 'venta_repuestos' ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">Manifiesta el Cliente:</h2>
              <textarea
                value={manifiestaCliente}
                onChange={(e) => setManifiestaCliente(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                placeholder="Qué reporta el cliente..."
              />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">Diagnóstico:</h2>
              <textarea
                value={diagnostico}
                onChange={(e) => setDiagnostico(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                placeholder="Diagnóstico del taller..."
              />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">
              {tipoOrden === 'venta_repuestos' ? 'Descripción / referencia' : 'Descripción del trabajo'}
            </h2>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
              placeholder={tipoOrden === 'venta_repuestos' ? 'Repuestos vendidos, referencia...' : 'Describe el trabajo a realizar...'}
            />
          </div>
        )}

        {/* Fotos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fotos y videos</label>
          <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors bg-gray-50">
            <span className="text-xs text-gray-500">Toca para agregar fotos/videos</span>
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="hidden" />
          </label>
          {previews.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mt-3">
              {previews.map((p, i) => (
                <div key={i} className="relative aspect-square">
                  {p.tipo === 'imagen'
                    ? <img src={p.url} alt="" className="w-full h-full object-cover rounded-lg" />
                    : <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
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
          {tipoOrden === 'venta_repuestos' ? '+ Registrar venta' : '+ Crear Entrada'}
        </Button>
      </form>
    </div>

    {buscandoCliente && profile?.tenant_id && (
      <BuscarClienteModal
        tenantId={profile.tenant_id}
        onSelect={seleccionarCliente}
        onCancel={() => setBuscandoCliente(false)}
      />
    )}
    </>
  )
}
