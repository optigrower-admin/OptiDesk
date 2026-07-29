'use client'
import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useEtapasPipeline } from '@/hooks/useEtapasPipeline'
import type { LeadData } from './components/LeadCard'
import PipelineKanban from './components/PipelineKanban'
import VistaHoy from './components/VistaHoy'
import VistaLista from './components/VistaLista'
import VistaBandeja from './VistaBandeja'
import { ImportadorExcel } from '@/components/ImportadorExcel'
import { importarSeguimientoVentas, previsualizarSeguimientoVentas } from '@/lib/bulkImport'
import WhatsAppCreditoModal from './components/WhatsAppCreditoModal'

type Tab = 'kanban' | 'bandeja' | 'hoy' | 'lista'

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
}

type UsuarioFiltro = { id: string; nombre: string }

const TIPOS_DOCUMENTO = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
  { value: 'RC', label: 'Registro civil' },
  { value: 'PEP', label: 'Permiso especial de permanencia' },
]

const DOMINIOS_CORREO = ['gmail.com', 'hotmail.com', 'outlook.com']

function formatCelular(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function NuevoClienteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (clienteId: string) => void }) {
  const supabase = createClient()
  const [primerNombre, setPrimerNombre]       = useState('')
  const [segundoNombre, setSegundoNombre]     = useState('')
  const [primerApellido, setPrimerApellido]   = useState('')
  const [segundoApellido, setSegundoApellido] = useState('')
  const [tipoDocumento, setTipoDocumento]     = useState('CC')
  const [numeroDocumento, setNumeroDocumento] = useState('') // solo dígitos
  const [celular, setCelular]     = useState('') // solo dígitos
  const [email, setEmail]         = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  // Detección de duplicados
  const [dupCelular, setDupCelular]       = useState<string | null>(null)
  const [dupDocumento, setDupDocumento]   = useState<string | null>(null)
  const [buscandoDup, setBuscandoDup]     = useState(false)

  const hayDuplicado = !!(dupCelular || dupDocumento)
  const valido = primerNombre.trim() !== '' && celular.trim() !== ''

  // Sugerencias de dominio de correo — solo si hay exactamente un "@" y el
  // usuario no ha terminado de escribir el dominio (sigue siendo opcional).
  const arrobaIdx = email.indexOf('@')
  const dominioEscrito = arrobaIdx >= 0 ? email.slice(arrobaIdx + 1) : ''
  const sugerenciasCorreo = arrobaIdx >= 0 && !dominioEscrito.includes('.')
    ? DOMINIOS_CORREO.filter(d => d.startsWith(dominioEscrito))
    : []
  const mostrarSugerencias = emailFocused && sugerenciasCorreo.length > 0

  async function verificarCelular(val: string) {
    if (!val.trim()) { setDupCelular(null); return }
    setBuscandoDup(true)
    const { data } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('celular', val.trim())
      .limit(1)
      .maybeSingle()
    setDupCelular(data?.nombre ?? null)
    setBuscandoDup(false)
  }

  async function verificarDocumento(val: string) {
    if (!val.trim()) { setDupDocumento(null); return }
    setBuscandoDup(true)
    const { data } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('cedula', val.trim())
      .limit(1)
      .maybeSingle()
    setDupDocumento(data?.nombre ?? null)
    setBuscandoDup(false)
  }

  async function crear() {
    if (!valido) return
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/admin/clientes/iniciar-seguimiento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primer_nombre: primerNombre.trim(),
          segundo_nombre: segundoNombre.trim() || null,
          primer_apellido: primerApellido.trim() || null,
          segundo_apellido: segundoApellido.trim() || null,
          tipo_documento: tipoDocumento,
          numero_documento: numeroDocumento || null,
          celular: celular.trim(),
          email: email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear el cliente')
      onCreated(json.cliente_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-base">Nuevo cliente en seguimiento</h2>
            <p className="text-xs text-gray-500 mt-0.5">Para clientes que se gestionan en persona, sin chat previo.</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-2xl leading-none transition-colors">
            ×
          </button>
        </div>

        {/* Campos (scrollable) */}
        <div className="px-5 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-3 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Campo label="Primer nombre *">
                <input value={primerNombre} onChange={e => setPrimerNombre(e.target.value.toUpperCase())} placeholder="Ej: JUAN"
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Campo>
              <Campo label="Segundo nombre (opcional)">
                <input value={segundoNombre} onChange={e => setSegundoNombre(e.target.value.toUpperCase())} placeholder="Ej: CARLOS"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Campo label="Primer apellido (opcional)">
                <input value={primerApellido} onChange={e => setPrimerApellido(e.target.value.toUpperCase())} placeholder="Ej: PÉREZ"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Campo>
              <Campo label="Segundo apellido (opcional)">
                <input value={segundoApellido} onChange={e => setSegundoApellido(e.target.value.toUpperCase())} placeholder="Ej: GÓMEZ"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Campo>
            </div>
            <Campo label="Celular *">
              <input
                value={formatCelular(celular)}
                onChange={e => { setCelular(e.target.value.replace(/\D/g, '').slice(0, 10)); setDupCelular(null) }}
                onBlur={e => verificarCelular(e.target.value.replace(/\D/g, ''))}
                placeholder="(321) 313-2978"
                type="tel" inputMode="tel"
                className={`w-full border rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 ${
                  dupCelular ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-blue-500'
                }`}
              />
            </Campo>
            <div className="grid grid-cols-[auto,1fr] gap-2.5">
              <Campo label="Tipo doc.">
                <select value={tipoDocumento} onChange={e => setTipoDocumento(e.target.value)}
                  className="border border-gray-200 rounded-xl px-2.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
                </select>
              </Campo>
              <Campo label="Número de documento (opcional)">
                <input
                  value={numeroDocumento ? Number(numeroDocumento).toLocaleString('es-CO') : ''}
                  onChange={e => { setNumeroDocumento(e.target.value.replace(/\D/g, '')); setDupDocumento(null) }}
                  onBlur={e => verificarDocumento(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" placeholder="Ej: 1.234.567"
                  className={`w-full border rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 ${
                    dupDocumento ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-blue-500'
                  }`}
                />
              </Campo>
            </div>
            <Campo label="Correo electrónico (opcional)">
              <div className="relative">
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value.toLowerCase())}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setTimeout(() => setEmailFocused(false), 150)}
                  placeholder="correo@ejemplo.com"
                  type="email" inputMode="email" autoCapitalize="none"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {mostrarSugerencias && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {sugerenciasCorreo.map(dominio => (
                      <button
                        key={dominio}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setEmail(`${email.slice(0, arrobaIdx)}@${dominio}`); setEmailFocused(false) }}
                        className="w-full text-left px-3.5 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        {email.slice(0, arrobaIdx)}@{dominio}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Campo>
          </div>

          {/* Avisos de duplicado */}
          {buscandoDup && <p className="text-xs text-gray-400 mt-1">Verificando duplicados...</p>}
          {dupCelular && (
            <div className="mt-3 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
              <p className="text-xs font-bold text-red-700">🚫 Celular ya registrado</p>
              <p className="text-xs text-red-600 mt-0.5">
                El número <span className="font-semibold">{formatCelular(celular)}</span> ya pertenece a{' '}
                <span className="font-semibold">{dupCelular}</span>.
                No se puede crear un nuevo cliente con ese número.
              </p>
            </div>
          )}
          {dupDocumento && (
            <div className="mt-3 bg-red-50 border border-red-300 rounded-xl px-3 py-2.5">
              <p className="text-xs font-bold text-red-700">🚫 Cédula ya registrada</p>
              <p className="text-xs text-red-600 mt-0.5">
                La cédula <span className="font-semibold">{Number(numeroDocumento).toLocaleString('es-CO')}</span> ya pertenece a{' '}
                <span className="font-semibold">{dupDocumento}</span>.
                No se puede crear un nuevo cliente con esa cédula.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-2">* Solo el primer nombre y el celular son obligatorios.</p>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        {/* Acciones (fijas abajo, siempre alcanzables con el pulgar) */}
        <div className="flex gap-2 px-5 pt-3 border-t border-gray-100 flex-shrink-0"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <button onClick={onClose} className="flex-1 py-3.5 border border-gray-200 text-gray-600 rounded-xl text-base font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={crear} disabled={!valido || guardando || hayDuplicado}
            className="flex-1 py-3.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-base font-semibold disabled:opacity-40 transition-colors">
            {guardando ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VentasClient({ leadsIniciales, tenantId }: Props) {
  const { profile } = useAuth()
  const supabase = createClient()
  const etapasPipeline = useEtapasPipeline(tenantId)
  const [tab, setTab] = useState<Tab>('kanban')
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [usuarios, setUsuarios] = useState<UsuarioFiltro[]>([])
  const [usuariosFiltro, setUsuariosFiltro] = useState<Set<string>>(new Set())
  const [abrirClienteId, setAbrirClienteId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [pipelineTabsSlot, setPipelineTabsSlot] = useState<HTMLDivElement | null>(null)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [idsExtraSearch, setIdsExtraSearch] = useState<Set<string>>(new Set())
  const [buscandoExtra, setBuscandoExtra] = useState(false)

  // Estado compartido de leads — para que un cambio hecho en cualquier vista (Kanban,
  // Hoy, Lista, Bandeja) se refleje de inmediato en el contador de arriba y en las
  // demás vistas, incluso si se cambia de pestaña (lo que remonta esa vista).
  const [leadsState, setLeadsState] = useState<LeadData[]>(leadsIniciales)
  useEffect(() => { setLeadsState(leadsIniciales) }, [leadsIniciales])

  const patchLead = useCallback((id: string, patch: Record<string, unknown>) => {
    setLeadsState(prev => prev.map(l => {
      if (l.id !== id) return l
      const clientePatch: Record<string, unknown> = {}
      if (patch.nombre  !== undefined) clientePatch.nombre  = patch.nombre
      if (patch.celular !== undefined) clientePatch.celular = patch.celular
      if (patch.placa   !== undefined) clientePatch.placa   = patch.placa
      return {
        ...l,
        ...patch,
        ...(l.cliente && Object.keys(clientePatch).length > 0 ? { cliente: { ...l.cliente, ...clientePatch } } : {}),
      } as LeadData
    }))
  }, [])

  const removeLead = useCallback((id: string) => {
    setLeadsState(prev => prev.filter(l => l.id !== id))
  }, [])

  // Al crear un cliente nuevo: lo trae y abre su ficha de inmediato, sin recargar la página.
  const cargarClienteYAbrir = useCallback(async (clienteId: string) => {
    setNuevoOpen(false)
    const { data: c } = await supabase
      .from('clientes')
      .select(`
        id, nombre, celular, etapa_venta, etapa_venta_orden,
        valor_estimado_venta, proxima_accion, proxima_accion_fecha,
        lead_source, sin_respuesta_asesor_desde, assigned_to,
        nombre_pendiente_aprobacion, alistamiento_orden_id,
        primer_apellido, cedula, email, estado_aprobacion_matricula, aprobado_matricula_por,
        placa, numero_factura, created_at,
        conversaciones ( id, canal, no_leidos_count )
      `)
      .eq('id', clienteId).single()
    if (!c) return

    const convs = (c.conversaciones as { id: string; canal: string; no_leidos_count: number }[] | null) ?? []
    const noLeidos = convs.reduce((s, cv) => s + (cv.no_leidos_count ?? 0), 0)
    const nuevoLead: LeadData = {
      id: c.id as string,
      etapa_venta: (c.etapa_venta ?? 'nuevo') as LeadData['etapa_venta'],
      etapa_venta_orden: (c.etapa_venta_orden ?? 0) as number,
      moto_interes: null,
      valor_estimado_venta: (c.valor_estimado_venta ?? null) as number | null,
      proxima_accion: (c.proxima_accion ?? null) as string | null,
      proxima_accion_fecha: (c.proxima_accion_fecha ?? null) as string | null,
      canal: convs[0]?.canal ?? 'manual',
      lead_source: (c.lead_source ?? null) as string | null,
      no_leidos_count: noLeidos,
      sin_respuesta_asesor_desde: (c.sin_respuesta_asesor_desde ?? null) as string | null,
      assigned_to: (c.assigned_to ?? null) as string | null,
      cliente: { id: c.id as string, nombre: (c.nombre ?? null) as string | null, celular: (c.celular ?? null) as string | null, placa: (c.placa ?? null) as string | null },
      alistamientoOrdenId: (c.alistamiento_orden_id ?? null) as string | null,
      cliente_apellido: (c.primer_apellido ?? null) as string | null,
      cliente_documento: (c.cedula ?? null) as string | null,
      cliente_email: (c.email ?? null) as string | null,
      nombre_pendiente_aprobacion: (c.nombre_pendiente_aprobacion ?? null) as boolean | null,
      leads_campana: [],
      todas_conversaciones: convs.map(cv => ({ id: cv.id, canal: cv.canal, no_leidos_count: cv.no_leidos_count ?? 0 })),
      etiquetas: [],
      estadoAprobacionMatricula: ((c.estado_aprobacion_matricula ?? 'pendiente') as 'pendiente' | 'aprobado' | 'rechazado'),
      aprobadoMatriculaPor: (c.aprobado_matricula_por ?? null) as string | null,
      numero_factura: (c.numero_factura ?? null) as string | null,
      created_at: (c.created_at ?? null) as string | null,
    }

    setLeadsState(prev => [nuevoLead, ...prev.filter(l => l.id !== nuevoLead.id)])
    setTab('kanban')
    setAbrirClienteId(clienteId)
  }, [supabase])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const abrir = params.get('abrir')
    if (abrir) {
      setAbrirClienteId(abrir)
      window.history.replaceState({}, '', '/admin/ventas')
    }
  }, [])

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('tenant_id', tenantId)
      .eq('es_asesor', true)
      .order('nombre')
      .then(({ data }) => {
        setUsuarios((data ?? []).map(u => ({
          id: u.id as string,
          nombre: (u.nombre as string | null) || (u.email as string | null) || 'Usuario',
        })))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // Búsqueda extendida: comentarios + recordatorios (debounced, server-side)
  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 2) {
      setIdsExtraSearch(new Set())
      setBuscandoExtra(false)
      return
    }
    setBuscandoExtra(true)
    const timer = setTimeout(async () => {
      try {
        const [{ data: comCliente }, { data: comGeneral }, { data: reminders }] = await Promise.all([
          supabase.from('comentarios_cliente').select('cliente_id').eq('tenant_id', tenantId).ilike('texto', `%${q}%`),
          supabase.from('comentarios').select('cliente_id').eq('tenant_id', tenantId).ilike('contenido', `%${q}%`),
          supabase.from('recordatorios').select('cliente_id').eq('tenant_id', tenantId).ilike('nota', `%${q}%`),
        ])
        const ids = new Set<string>()
        for (const r of comCliente  ?? []) if (r.cliente_id) ids.add(r.cliente_id as string)
        for (const r of comGeneral  ?? []) if (r.cliente_id) ids.add(r.cliente_id as string)
        for (const r of reminders   ?? []) if (r.cliente_id) ids.add(r.cliente_id as string)
        setIdsExtraSearch(ids)
      } finally {
        setBuscandoExtra(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, tenantId])

  const activos = useMemo(
    () => leadsState.filter(l => etapasPipeline.etapaMap[l.etapa_venta]?.es_activa),
    [leadsState, etapasPipeline.etapaMap]
  )

  const leadsFiltrados = useMemo(() => {
    let lista = usuariosFiltro.size > 0 ? leadsState.filter(l => usuariosFiltro.has(l.assigned_to ?? '')) : leadsState
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      lista = lista.filter(l =>
        l.cliente?.nombre?.toLowerCase().includes(q) ||
        l.cliente?.celular?.includes(q) ||
        l.cliente_documento?.includes(q) ||
        l.cliente?.placa?.toLowerCase().includes(q) ||
        l.numero_factura?.toLowerCase().includes(q) ||
        l.cliente_email?.toLowerCase().includes(q) ||
        idsExtraSearch.has(l.id)
      )
    }
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00').getTime()
      lista = lista.filter(l => l.created_at && new Date(l.created_at).getTime() >= desde)
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59.999').getTime()
      lista = lista.filter(l => l.created_at && new Date(l.created_at).getTime() <= hasta)
    }
    return lista
  }, [leadsState, usuariosFiltro, busqueda, idsExtraSearch, fechaDesde, fechaHasta])

  const sinSeguim = activos.filter(l => !l.proxima_accion_fecha).length

  return (
    <div className="p-5">
      {nuevoOpen && <NuevoClienteModal onClose={() => setNuevoOpen(false)} onCreated={cargarClienteYAbrir} />}
      {whatsappOpen && <WhatsAppCreditoModal leads={leadsState} onClose={() => setWhatsappOpen(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline - Seguimiento Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activos.length} clientes activos
            {sinSeguim > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · ⚠️ {sinSeguim} sin seguimiento
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setNuevoOpen(true)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
            + Nuevo cliente
          </button>
          <button onClick={() => setWhatsappOpen(true)}
            title="Generar lista de clientes para WhatsApp (estudio de crédito)"
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
            📋 Lista WA
          </button>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([
              { id: 'kanban',  label: 'Kanban' },
              { id: 'bandeja', label: '📥 Bandeja' },
              { id: 'hoy',     label: 'Hoy' },
              { id: 'lista',   label: 'Lista' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtro por usuario (multi-select) */}
      {usuarios.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Asesor:</span>
          <button
            onClick={() => setUsuariosFiltro(new Set())}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
              usuariosFiltro.size === 0
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            Todos
          </button>
          {usuarios.map(u => {
            const activo = usuariosFiltro.has(u.id)
            return (
              <button
                key={u.id}
                onClick={() => setUsuariosFiltro(prev => {
                  const next = new Set(prev)
                  if (next.has(u.id)) next.delete(u.id)
                  else next.add(u.id)
                  return next
                })}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  activo
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                {u.nombre}
              </button>
            )
          })}
        </div>
      )}

      {/* Buscador */}
      {tab !== 'bandeja' && (
        <div className="mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Nombre, cédula, celular, placa, correo, comentarios, recordatorios..."
                className="w-full pl-8 pr-8 py-2 border-2 border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
              {busqueda && (
                <button onClick={() => setBusqueda('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 flex-shrink-0">Agregado:</span>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                title="Desde"
                className="border-2 border-gray-300 rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" />
              <span className="text-xs text-gray-400 flex-shrink-0">a</span>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                title="Hasta"
                className="border-2 border-gray-300 rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" />
              {(fechaDesde || fechaHasta) && (
                <button onClick={() => { setFechaDesde(''); setFechaHasta('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
                  × Limpiar
                </button>
              )}
            </div>

            {tab === 'kanban' && <div ref={setPipelineTabsSlot} className="flex-shrink-0" />}
          </div>
          {busqueda.trim() && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              {buscandoExtra
                ? 'Buscando en comentarios y recordatorios...'
                : leadsFiltrados.length === 0
                  ? 'Sin resultados para esta búsqueda.'
                  : `${leadsFiltrados.length} cliente${leadsFiltrados.length === 1 ? '' : 's'} encontrado${leadsFiltrados.length === 1 ? '' : 's'}`}
            </p>
          )}
          {!busqueda.trim() && (fechaDesde || fechaHasta) && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              {leadsFiltrados.length} cliente{leadsFiltrados.length === 1 ? '' : 's'} agregado{leadsFiltrados.length === 1 ? '' : 's'} en ese rango
            </p>
          )}
        </div>
      )}

      {/* Content */}
      {tab === 'kanban' && (
        <PipelineKanban leadsIniciales={leadsFiltrados} tenantId={tenantId} usuarios={usuarios} abrirClienteId={abrirClienteId ?? undefined} tabsSlot={pipelineTabsSlot} onLeadPatch={patchLead} onLeadRemove={removeLead} etapasPipeline={etapasPipeline} />
      )}
      {tab === 'bandeja' && (
        <VistaBandeja leads={leadsFiltrados} tenantId={tenantId} usuarios={usuarios} onLeadPatch={patchLead} onLeadRemove={removeLead} />
      )}
      {tab === 'hoy' && (
        <VistaHoy leads={leadsFiltrados} tenantId={tenantId} onLeadPatch={patchLead} onLeadRemove={removeLead} />
      )}
      {tab === 'lista' && (
        <VistaLista leads={leadsFiltrados} tenantId={tenantId} onLeadPatch={patchLead} onLeadRemove={removeLead} />
      )}
    </div>
  )
}
