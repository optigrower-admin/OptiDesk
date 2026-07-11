'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPAS, ETAPA_MAP, ETAPAS_LEADS, ETAPAS_NECESITAN_PLACA, ETAPAS_NECESITAN_FACTURA, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './LeadCard'
import VincularClienteModal from './VincularClienteModal'
import EtiquetasPicker, { type Etiqueta } from './EtiquetasPicker'
import ResumenTab from './ficha/ResumenTab'
import DatosClienteTab from './ficha/DatosClienteTab'
import MotosInteresTab from './ficha/MotosInteresTab'
import PagoTab from './ficha/PagoTab'
import ArchivosTab from './ficha/ArchivosTab'
import ComentariosTab from './ficha/ComentariosTab'
import PasosTab from './ficha/PasosTab'
import RecordatoriosTab from './ficha/RecordatoriosTab'
import HistorialTab from './ficha/HistorialTab'
import VisibilidadTab from './ficha/VisibilidadTab'
import CotizacionTab from './ficha/CotizacionTab'

const CANAL_ICON: Record<string, string> = {
  whatsapp: '📱', messenger: '💬', instagram: '📸', manual: '✍️',
}
const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', manual: 'Manual',
}

type Usuario = { nombre: string; email: string; rol: string } | null

type Mensaje = {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string
  contenido: string | null
  created_at: string
  estado_envio: string
  enviado_por: string | null
  usuarios: Usuario
}

type Orden = {
  id: string
  created_at: string
  estado: string
  descripcion_problema: string | null
}

interface Props {
  lead: LeadData
  tenantId: string
  onClose: () => void
  onEtapaChange: (id: string, etapa: EtapaVenta) => void
  onLeadUpdate?: (id: string, updates: { proxima_accion?: string | null; proxima_accion_fecha?: string | null; nombre?: string; nombre_pendiente_aprobacion?: boolean | null; etiquetas?: Etiqueta[]; placa?: string | null; celular?: string | null; numero_factura?: string | null }) => void
  onLeadDelete?: (id: string) => void
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Admin', superadmin: 'SuperAdmin', mecanico: 'Mecánico', gerencia: 'Gerencia', control_total: 'Control total',
}

type TabDerecha = 'resumen' | 'datos' | 'chats' | 'motos' | 'cotizacion' | 'pago' | 'archivos' | 'comentarios' | 'pasos' | 'recordatorios' | 'historial' | 'visibilidad'

const TABS: { id: TabDerecha; label: string; icon: string }[] = [
  { id: 'resumen',       label: 'Resumen',       icon: '📋' },
  { id: 'datos',         label: 'Datos',         icon: '🪪' },
  { id: 'chats',         label: 'Chats',         icon: '📱' },
  { id: 'motos',         label: 'Motos',         icon: '🏍️' },
  { id: 'cotizacion',    label: 'Cotización',    icon: '📄' },
  { id: 'pago',          label: 'Pago',          icon: '💳' },
  { id: 'archivos',      label: 'Archivos',      icon: '📎' },
  { id: 'comentarios',   label: 'Comentarios',   icon: '💬' },
  { id: 'pasos',         label: 'Pasos',         icon: '✅' },
  { id: 'recordatorios', label: 'Recordatorios', icon: '⏰' },
]
const TABS_GERENCIA: { id: TabDerecha; label: string; icon: string }[] = [
  { id: 'historial',   label: 'Historial',   icon: '📅' },
  { id: 'visibilidad', label: 'Visibilidad', icon: '🔒' },
]

export default function FichaProspecto({ lead, tenantId, onClose, onEtapaChange, onLeadUpdate, onLeadDelete }: Props) {
  const supabase = createClient()
  const { profile } = useAuth()
  const endRef   = useRef<HTMLDivElement>(null)
  const esGerencia = profile?.rol === 'gerencia' || profile?.rol === 'control_total'

  const [mensajes, setMensajes]         = useState<Mensaje[]>([])
  const [ordenes, setOrdenes]           = useState<Orden[]>([])
  const [usuarios, setUsuarios]         = useState<{ id: string; nombre: string }[]>([])
  const [clienteEmail, setClienteEmail] = useState<string | null>(null)
  const [input, setInput]               = useState('')
  const [tipoMsg, setTipoMsg]           = useState<'mensaje' | 'nota'>('mensaje')
  const [sending, setSending]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [savedOk, setSavedOk]           = useState(false)
  const [tabDer, setTabDer]             = useState<TabDerecha>('resumen')
  const [vincularOpen, setVincularOpen] = useState(false)
  const [convActivaId, setConvActivaId] = useState(lead.todas_conversaciones[0]?.id ?? '')

  // Renombrar / eliminar cliente (solo Gerencia)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nuevoNombre, setNuevoNombre]       = useState(lead.cliente?.nombre ?? '')
  const [savingNombre, setSavingNombre]     = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('')
  const [deleting, setDeleting]             = useState(false)
  const [aprobacionStatus, setAprobacionStatus] = useState<'pendiente' | 'aprobado' | 'rechazado'>(
    lead.estadoAprobacionMatricula ?? 'pendiente'
  )

  // Celular
  const [celularActual, setCelularActual]   = useState(lead.cliente?.celular ?? '')
  const [celularInput, setCelularInput]     = useState(lead.cliente?.celular ?? '')
  const [savingCelular, setSavingCelular]   = useState(false)

  // Placa
  const [placaActual, setPlacaActual]       = useState(lead.cliente?.placa ?? '')
  const [placaInput, setPlacaInput]         = useState(lead.cliente?.placa ?? '')
  const [editandoPlaca, setEditandoPlaca]   = useState(false)
  const [savingPlaca, setSavingPlaca]       = useState(false)

  // Factura
  const [facturaActual, setFacturaActual]   = useState(lead.numero_factura ?? '')
  const [facturaInput, setFacturaInput]     = useState(lead.numero_factura ?? '')
  const [editandoFactura, setEditandoFactura] = useState(false)
  const [savingFactura, setSavingFactura]   = useState(false)

  // Alistamiento manual
  const [alistamientoOrdenId, setAlistamientoOrdenId] = useState<string | null>(lead.alistamientoOrdenId ?? null)
  const [ordenesUMA, setOrdenesUMA]           = useState<{ id: string; created_at: string; estado: string }[]>([])
  const [loadingOrdenesUMA, setLoadingOrdenesUMA] = useState(false)
  const [ordenesUMALoaded, setOrdenesUMALoaded]   = useState(false)

  // Derivados de alerta
  const sinCelular          = (ETAPAS_LEADS as EtapaVenta[]).includes(lead.etapa_venta) && !celularActual
  const enEtapaConPlaca     = (ETAPAS_NECESITAN_PLACA as EtapaVenta[]).includes(lead.etapa_venta)
  const enEtapaAlistamiento = lead.etapa_venta === 'espera_entrega' || lead.etapa_venta === 'entregada'
  const tieneAlistamientoFinal = lead.tieneAlistamiento === true || !!alistamientoOrdenId
  const enEtapaFactura      = (ETAPAS_NECESITAN_FACTURA as EtapaVenta[]).includes(lead.etapa_venta)

  // Campos editables — tab Resumen
  const [etapa, setEtapa]         = useState<EtapaVenta>(lead.etapa_venta)
  const [assignedTo, setAssignedTo] = useState('')

  const cargar = useCallback(async () => {
    const [{ data: msgs }, { data: ords }, { data: us }, { data: cliente }] = await Promise.all([
      convActivaId
        ? supabase.from('mensajes')
            .select('id,direccion,tipo,contenido,created_at,estado_envio,enviado_por,usuarios(nombre,email,rol)')
            .eq('conversacion_id', convActivaId).order('created_at').limit(200)
        : Promise.resolve({ data: [] }),
      supabase.from('ordenes').select('id,created_at,estado,descripcion_problema')
        .eq('cliente_id', lead.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('usuarios').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true),
      supabase.from('clientes').select('email, assigned_to').eq('id', lead.id).single(),
    ])
    setMensajes((msgs ?? []) as unknown as Mensaje[])
    setOrdenes((ords ?? []) as Orden[])
    setUsuarios((us ?? []) as { id: string; nombre: string }[])
    setClienteEmail(cliente?.email ?? null)
    setAssignedTo(cliente?.assigned_to ?? '')
  }, [lead.id, convActivaId, tenantId])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes])

  const enviar = async () => {
    const texto = input.trim()
    if (!texto || sending || !convActivaId) return
    setSending(true); setInput('')
    try {
      const res = await fetch('/api/admin/mensajes/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacion_id: convActivaId,
          contenido: texto,
          tipo: tipoMsg === 'nota' ? 'nota_interna' : 'texto',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.mensaje) setMensajes(p => [...p, json.mensaje as Mensaje])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al enviar')
      setInput(texto)
    } finally { setSending(false) }
  }

  // Registra cualquier cambio en historial (defensivo: no rompe si la tabla aún no existe)
  const logCambio = useCallback(async (campo: string, valorAnterior: string | null, valorNuevo: string) => {
    try {
      await supabase.from('historial_cambios_cliente').insert({
        cliente_id: lead.id,
        tenant_id: tenantId,
        usuario_id: profile?.id ?? null,
        campo,
        valor_anterior: valorAnterior ?? null,
        valor_nuevo: valorNuevo,
      })
    } catch { /* tabla aún no existe — ignorar */ }
  }, [lead.id, tenantId, profile?.id, supabase])

  const mostrarGuardado = useCallback(() => {
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 2000)
  }, [])

  // Auto-guarda etapa al cambiarla en el select
  const autoSaveEtapa = async (newEtapa: EtapaVenta) => {
    const prev = etapa
    setEtapa(newEtapa)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ventas/guardar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: lead.id, etapa_venta: newEtapa }),
      })
      if (res.ok) {
        onEtapaChange(lead.id, newEtapa)
        mostrarGuardado()
        await logCambio('etapa', ETAPA_MAP[prev]?.label ?? prev, ETAPA_MAP[newEtapa]?.label ?? newEtapa)
      }
    } finally { setSaving(false) }
  }

  // Auto-guarda asesor al cambiarlo en el select (solo gerencia)
  const autoSaveAssigned = async (newId: string) => {
    const prevNombre = usuarios.find(u => u.id === assignedTo)?.nombre ?? 'Sin asignar'
    setAssignedTo(newId)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ventas/guardar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: lead.id, assigned_to: newId || null }),
      })
      if (res.ok) {
        mostrarGuardado()
        const newNombre = usuarios.find(u => u.id === newId)?.nombre ?? 'Sin asignar'
        await logCambio('asignado_a', prevNombre, newNombre)
      }
    } finally { setSaving(false) }
  }

  const handleRenombrar = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre || !lead.cliente?.id) return
    setSavingNombre(true)
    await supabase.from('clientes')
      .update({ nombre, nombre_pendiente_aprobacion: false })
      .eq('id', lead.cliente.id)
    onLeadUpdate?.(lead.id, { nombre, nombre_pendiente_aprobacion: false })
    setEditandoNombre(false)
    setSavingNombre(false)
  }

  const guardarCelular = async () => {
    const cel = celularInput.trim()
    if (!cel || cel === celularActual) return
    setSavingCelular(true)
    const { error } = await supabase.from('clientes').update({ celular: cel }).eq('id', lead.id).eq('tenant_id', tenantId)
    if (error) {
      alert(`No se pudo guardar el celular: ${error.message}`)
      setCelularInput(celularActual)
    } else {
      await logCambio('celular', celularActual || null, cel)
      setCelularActual(cel)
      onLeadUpdate?.(lead.id, { celular: cel })
      mostrarGuardado()
    }
    setSavingCelular(false)
  }

  const guardarPlaca = async () => {
    const pl = placaInput.trim().toUpperCase()
    if (!pl || pl === placaActual) { setEditandoPlaca(false); return }
    setSavingPlaca(true)
    const { error } = await supabase.from('clientes').update({ placa: pl }).eq('id', lead.id).eq('tenant_id', tenantId)
    if (error) {
      alert(`No se pudo guardar la placa: ${error.message}`)
      setPlacaInput(placaActual)
    } else {
      await logCambio('placa', placaActual || null, pl)
      setPlacaActual(pl)
      setPlacaInput(pl)
      setEditandoPlaca(false)
      onLeadUpdate?.(lead.id, { placa: pl })
      mostrarGuardado()
    }
    setSavingPlaca(false)
  }

  const guardarFactura = async () => {
    const fac = facturaInput.trim().toUpperCase()
    if (!fac || fac === facturaActual) { setEditandoFactura(false); return }
    setSavingFactura(true)
    const { error } = await supabase.from('clientes').update({ numero_factura: fac }).eq('id', lead.id).eq('tenant_id', tenantId)
    if (error) {
      alert(`No se pudo guardar la factura: ${error.message}`)
      setFacturaInput(facturaActual)
    } else {
      await logCambio('factura', facturaActual || null, fac)
      setFacturaActual(fac)
      setFacturaInput(fac)
      setEditandoFactura(false)
      onLeadUpdate?.(lead.id, { numero_factura: fac })
      mostrarGuardado()
    }
    setSavingFactura(false)
  }

  const cargarOrdenesUMA = async () => {
    if (ordenesUMALoaded) return
    setLoadingOrdenesUMA(true)
    const { data } = await supabase
      .from('ordenes')
      .select('id, created_at, estado')
      .eq('cliente_id', lead.id)
      .eq('tenant_id', tenantId)
      .eq('tipo_servicio', 'uma')
      .order('created_at', { ascending: false })
    setOrdenesUMA((data ?? []) as { id: string; created_at: string; estado: string }[])
    setOrdenesUMALoaded(true)
    setLoadingOrdenesUMA(false)
  }

  const vincularAlistamiento = async (ordenId: string) => {
    await supabase.from('clientes').update({ alistamiento_orden_id: ordenId }).eq('id', lead.id).eq('tenant_id', tenantId)
    setAlistamientoOrdenId(ordenId)
  }

  const desvincularAlistamiento = async () => {
    await supabase.from('clientes').update({ alistamiento_orden_id: null }).eq('id', lead.id).eq('tenant_id', tenantId)
    setAlistamientoOrdenId(null)
    setOrdenesUMALoaded(false)
  }

  const actualizarAprobacion = async (status: 'pendiente' | 'aprobado' | 'rechazado') => {
    setAprobacionStatus(status)
    await supabase
      .from('clientes')
      .update({ estado_aprobacion_matricula: status })
      .eq('id', lead.id)
      .eq('tenant_id', tenantId)
  }

  const handleEliminar = async () => {
    if (!lead.cliente?.id) return
    setDeleting(true)
    // Sacar del seguimiento vía la ruta de guardar (admin client, bypasa RLS)
    await fetch('/api/admin/ventas/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: lead.cliente.id, en_seguimiento_ventas: false }),
    })
    onLeadDelete?.(lead.id)
    onClose()
  }

  const etapaActual = ETAPA_MAP[etapa]

  return (
    <>
    {vincularOpen && lead.cliente && (
      <VincularClienteModal
        tenantId={tenantId}
        clienteOrigenId={lead.cliente.id}
        clienteOrigenNombre={lead.cliente.nombre ?? 'Sin nombre'}
        onConfirm={(_nuevoId, nuevoNombre) => {
          setVincularOpen(false)
          alert(`✅ Vinculado a "${nuevoNombre}". Para desvincular entra al perfil del cliente. Recargando...`)
          window.location.reload()
        }}
        onCancel={() => setVincularOpen(false)}
      />
    )}
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">

        {/* Modal confirmar eliminación */}
        {confirmDelete && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 mx-4">
              <h2 className="font-bold text-red-700 mb-1">⚠️ Sacar de seguimiento</h2>
              <p className="text-sm text-gray-600 mb-3">
                <strong>{lead.cliente?.nombre ?? 'Este cliente'}</strong> desaparecerá del tablero de ventas. Sus conversaciones, historial y datos quedan guardados y podrán consultarse en el perfil del cliente.
              </p>
              <p className="text-xs text-gray-500 mb-1.5">Para confirmar, escribe <span className="font-bold text-red-600">ELIMINAR</span> en el campo:</p>
              <input
                autoFocus
                value={confirmDeleteInput}
                onChange={e => setConfirmDeleteInput(e.target.value)}
                placeholder="Escribe ELIMINAR"
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => { setConfirmDelete(false); setConfirmDeleteInput('') }} disabled={deleting}
                  className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                  Cancelar
                </button>
                <button onClick={handleEliminar} disabled={deleting || confirmDeleteInput !== 'ELIMINAR'}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {editandoNombre ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenombrar(); if (e.key === 'Escape') setEditandoNombre(false) }}
                  className="border border-blue-400 rounded-lg px-2.5 py-1 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
                />
                <button onClick={handleRenombrar} disabled={savingNombre}
                  className="px-2.5 py-1 bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40">
                  {savingNombre ? '...' : 'OK'}
                </button>
                <button onClick={() => setEditandoNombre(false)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold text-gray-900">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
                {esGerencia && (
                  <button onClick={() => { setNuevoNombre(lead.cliente?.nombre ?? ''); setEditandoNombre(true) }}
                    className="text-gray-300 hover:text-blue-500 transition-colors" title="Editar nombre">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white flex-shrink-0"
              style={{ background: etapaActual.color }}>
              {etapaActual.label}
            </span>
            {lead.cliente?.celular && (
              <span className="text-xs text-gray-400 flex-shrink-0">{lead.cliente.celular}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {profile?.rol === 'gerencia' && (
              <button onClick={() => { setConfirmDeleteInput(''); setConfirmDelete(true) }}
                className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">
                🗑 Eliminar
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
          </div>
        </div>

        {/* Etiquetas */}
        <div className="px-5 py-2 border-b flex-shrink-0 bg-gray-50/50">
          <EtiquetasPicker
            tenantId={tenantId}
            clienteId={lead.id}
            etiquetasIniciales={lead.etiquetas}
            onChange={etiquetas => onLeadUpdate?.(lead.id, { etiquetas })}
          />
        </div>

        {/* ── Tabs en fila única ── */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto">
          {[...TABS, ...(esGerencia ? TABS_GERENCIA : [])].map(t => (
            <button key={t.id} onClick={() => setTabDer(t.id)}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tabDer === t.id
                  ? (t.id === 'historial' || t.id === 'visibilidad'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-blue-600 bg-blue-50 text-blue-700')
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Alerta: Sin celular ── */}
        {sinCelular && (
          <div className="border-b px-4 py-3 bg-orange-50 flex-shrink-0">
            <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-1">⚠ Sin número de celular</p>
            <p className="text-[11px] text-orange-600 mb-2.5">Este lead no tiene celular registrado. Agrégalo para poder contactarlo.</p>
            <div className="flex items-center gap-2">
              <input
                value={celularInput}
                onChange={e => setCelularInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarCelular() }}
                onBlur={guardarCelular}
                placeholder="Ej: 3001234567"
                type="tel"
                className="flex-1 border border-orange-300 bg-white rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {savingCelular && <span className="text-xs text-orange-500 flex-shrink-0">Guardando...</span>}
            </div>
          </div>
        )}

        {/* ── Sección: Placa ── */}
        {enEtapaConPlaca && (
          <div className={`border-b px-4 py-3 flex-shrink-0 ${placaActual ? 'bg-teal-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs font-bold uppercase tracking-wide ${placaActual ? 'text-teal-700' : 'text-red-700'}`}>
                {placaActual ? '🏍️ Placa asignada' : '⚠ Sin placa asignada'}
              </p>
              {placaActual && esGerencia && !editandoPlaca && (
                <button onClick={() => setEditandoPlaca(true)} className="text-xs text-teal-600 hover:underline font-medium">
                  ✏️ Editar
                </button>
              )}
            </div>
            {placaActual && !editandoPlaca ? (
              <p className="text-4xl font-black text-teal-800 tracking-[0.2em] text-center py-2 bg-white rounded-xl border border-teal-200">
                {placaActual}
              </p>
            ) : (
              <>
                {!placaActual && <p className="text-[11px] text-red-600 mb-2">Ingresa la placa de la moto entregada a este cliente.</p>}
                <div className="flex items-center gap-2 mt-1">
                  <input
                    value={placaInput}
                    onChange={e => setPlacaInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') guardarPlaca() }}
                    onBlur={guardarPlaca}
                    placeholder="ABC123"
                    className="flex-1 border border-red-300 bg-white rounded-xl px-3 py-2 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  {savingPlaca && <span className="text-xs text-red-500 flex-shrink-0">Guardando...</span>}
                  {editandoPlaca && !savingPlaca && (
                    <button onClick={() => { setEditandoPlaca(false); setPlacaInput(placaActual) }}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 flex-shrink-0">
                      ✕
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Sección: Alistamiento ── */}
        {enEtapaAlistamiento && (
          <div className={`border-b px-4 py-3 flex-shrink-0 ${tieneAlistamientoFinal ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs font-bold uppercase tracking-wide ${tieneAlistamientoFinal ? 'text-green-700' : 'text-red-700'}`}>
                {tieneAlistamientoFinal ? '✅ Alistamiento vinculado' : '⚠ Falta alistamiento'}
              </p>
              {tieneAlistamientoFinal && esGerencia && (
                <button onClick={desvincularAlistamiento} className="text-xs text-red-500 hover:underline">
                  Desvincular
                </button>
              )}
            </div>
            {tieneAlistamientoFinal ? (
              alistamientoOrdenId ? (
                <a href={`/admin/ordenes/${alistamientoOrdenId}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 underline hover:text-green-900 transition-colors">
                  🔧 Ver orden de alistamiento #{alistamientoOrdenId.slice(-8).toUpperCase()} →
                </a>
              ) : (
                <div>
                  <p className="text-[11px] text-green-600 mb-1.5">Detectada automáticamente en Servicio Técnico.</p>
                  {!ordenesUMALoaded ? (
                    <button onClick={cargarOrdenesUMA} disabled={loadingOrdenesUMA}
                      className="text-sm font-semibold text-green-700 underline hover:text-green-900 disabled:opacity-60 transition-colors">
                      {loadingOrdenesUMA ? '⏳ Cargando...' : '🔧 Ver en Servicio Técnico →'}
                    </button>
                  ) : (
                    <div className="space-y-1">
                      {ordenesUMA.length === 0 ? (
                        <p className="text-xs text-gray-500">No se encontraron órdenes UMA para este cliente.</p>
                      ) : ordenesUMA.map(o => (
                        <a key={o.id} href={`/admin/ordenes/${o.id}`}
                          className="flex items-center gap-1.5 text-sm font-semibold text-green-700 underline hover:text-green-900 transition-colors">
                          🔧 Orden #{o.id.slice(-8).toUpperCase()} ({o.estado}) →
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <>
                <p className="text-[11px] text-red-600 mb-2.5">No se encontró una orden UMA de alistamiento. Vincúlala o créala en Servicio Técnico.</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={cargarOrdenesUMA}
                    disabled={loadingOrdenesUMA}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
                    {loadingOrdenesUMA ? '⏳ Cargando...' : '📎 Ver órdenes UMA de este cliente'}
                  </button>
                  <a href="/admin/ordenes"
                    className="flex-1 py-2 bg-white border border-red-300 text-red-600 rounded-xl text-sm font-bold text-center hover:bg-red-50 transition-colors">
                    ➕ Crear en Servicio Técnico
                  </a>
                </div>
                {ordenesUMALoaded && (
                  <div className="mt-2.5 space-y-1.5">
                    {ordenesUMA.length === 0 ? (
                      <p className="text-xs text-red-400 text-center py-2">No hay órdenes UMA para este cliente.</p>
                    ) : ordenesUMA.map(o => (
                      <button key={o.id} onClick={() => vincularAlistamiento(o.id)}
                        className="w-full flex items-center justify-between bg-white border border-red-200 hover:border-red-500 rounded-xl px-3 py-2 text-sm transition-colors text-left">
                        <span className="font-mono text-xs text-gray-500">#{o.id.slice(-8).toUpperCase()}</span>
                        <span className="text-xs text-gray-600">{new Date(o.created_at).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' })}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${o.estado === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {o.estado}
                        </span>
                        <span className="text-xs font-bold text-red-600">Vincular →</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Aprobación para matrícula ── */}
        {lead.etapa_venta === 'aprobado_matricula' && (
          <div className="border-b px-4 py-3 bg-amber-50 flex-shrink-0">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Estado de aprobación para matrícula</p>
            <div className="flex gap-2">
              {([
                { key: 'pendiente', label: '⏳ Pendiente',  activo: 'bg-amber-500 border-amber-500 text-white',  inactivo: 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'  },
                { key: 'aprobado',  label: '✅ Aprobado',   activo: 'bg-green-600 border-green-600 text-white',  inactivo: 'bg-white text-gray-500 border-gray-200 hover:border-green-300'  },
                { key: 'rechazado', label: '❌ Rechazado',  activo: 'bg-red-600 border-red-600 text-white',      inactivo: 'bg-white text-gray-500 border-gray-200 hover:border-red-300'    },
              ] as const).map(({ key, label, activo, inactivo }) => (
                <button key={key}
                  onClick={() => actualizarAprobacion(key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                    aprobacionStatus === key ? activo : inactivo
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Sección: Factura ── */}
        {enEtapaFactura && (
          <div className={`border-b px-4 py-3 flex-shrink-0 ${facturaActual ? 'bg-teal-50' : 'bg-orange-50'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs font-bold uppercase tracking-wide ${facturaActual ? 'text-teal-700' : 'text-orange-700'}`}>
                {facturaActual ? '🧾 Factura de venta' : '⚠ Sin número de factura'}
              </p>
              {facturaActual && esGerencia && !editandoFactura && (
                <button onClick={() => setEditandoFactura(true)} className="text-xs text-teal-600 hover:underline font-medium">
                  ✏️ Editar
                </button>
              )}
            </div>
            {facturaActual && !editandoFactura ? (
              <p className="text-3xl font-black text-teal-800 tracking-[0.15em] text-center py-2 bg-white rounded-xl border border-teal-200">
                {facturaActual}
              </p>
            ) : (
              <>
                {!facturaActual && <p className="text-[11px] text-orange-600 mb-2">Ingresa el número de factura de esta venta.</p>}
                <div className="flex gap-2 mt-1">
                  <input
                    value={facturaInput}
                    onChange={e => setFacturaInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') guardarFactura() }}
                    onBlur={guardarFactura}
                    placeholder="Ej: FAC-00123"
                    className="flex-1 border border-orange-300 bg-white rounded-xl px-3 py-2 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {savingFactura && <span className="text-xs text-orange-500 flex-shrink-0">Guardando...</span>}
                  {editandoFactura && !savingFactura && (
                    <button onClick={() => { setEditandoFactura(false); setFacturaInput(facturaActual) }}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 flex-shrink-0">
                      ✕
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* ── Chat ── */}
          <div className={`flex-1 flex flex-col ${tabDer !== 'chats' ? 'hidden' : ''}`}>

            {lead.todas_conversaciones.length > 0 && (
              <div className="flex border-b bg-gray-50 px-2 pt-1.5 gap-0.5 flex-shrink-0 overflow-x-auto">
                {lead.todas_conversaciones.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setConvActivaId(c.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-colors border-b-2 whitespace-nowrap ${
                      convActivaId === c.id
                        ? 'bg-white border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <span>{CANAL_ICON[c.canal] ?? '💭'}</span>
                    <span>{CANAL_LABEL[c.canal] ?? c.canal}</span>
                    {c.no_leidos_count > 0 && (
                      <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                        {c.no_leidos_count > 9 ? '9+' : c.no_leidos_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {lead.todas_conversaciones.length > 0 && (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
                  {mensajes.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-8">Sin mensajes aún</p>
                  )}
                  {mensajes.map((m, i) => {
                    const isOut  = m.direccion === 'saliente'
                    const isNota = m.tipo === 'nota_interna'
                    const showDate = i === 0 || formatDate(m.created_at) !== formatDate(mensajes[i-1].created_at)
                    const usuario = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios

                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="text-center my-2">
                            <span className="text-xs bg-gray-200 text-gray-500 px-3 py-0.5 rounded-full">
                              {formatDate(m.created_at)}
                            </span>
                          </div>
                        )}

                        {isNota ? (
                          <div className="flex justify-center my-1">
                            <div className="max-w-sm bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-xs text-yellow-800">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-semibold">📝 Nota interna</span>
                                {usuario && (
                                  <span className="text-yellow-600">
                                    · {usuario.nombre} ({ROL_LABEL[usuario.rol] ?? usuario.rol})
                                  </span>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap">{m.contenido}</p>
                              <p className="text-yellow-500 mt-1 text-right">{formatTime(m.created_at)}</p>
                            </div>
                          </div>
                        ) : (
                          <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} mb-1`}>
                            {isOut && usuario && (
                              <p className="text-xs text-gray-400 mb-0.5 px-1">
                                {usuario.nombre} · <span className="italic">{ROL_LABEL[usuario.rol] ?? usuario.rol}</span>
                              </p>
                            )}
                            <div className={`max-w-xs rounded-2xl px-3 py-2 shadow-sm text-sm ${
                              isOut ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                            }`}>
                              <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                              <div className={`flex items-center justify-end gap-1 mt-0.5 text-xs ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                                <span>{formatTime(m.created_at)}</span>
                                {isOut && (
                                  <span>
                                    {m.estado_envio === 'leido'   ? <span className="text-sky-300">✓✓</span>
                                     : m.estado_envio === 'enviado' ? <span className="opacity-60">✓</span>
                                     : m.estado_envio === 'fallido' ? <span className="text-red-300">✗</span>
                                     : <span className="opacity-40">⏳</span>}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={endRef} />
                </div>

                <div className="border-t bg-white">
                  <div className="flex border-b">
                    <button onClick={() => setTipoMsg('mensaje')}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        tipoMsg === 'mensaje' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      💬 Mensaje al cliente
                    </button>
                    <button onClick={() => setTipoMsg('nota')}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        tipoMsg === 'nota' ? 'bg-yellow-50 text-yellow-700 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      📝 Nota interna
                    </button>
                  </div>
                  <div className="px-3 py-2 flex gap-2">
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                      placeholder={tipoMsg === 'nota' ? 'Escribe una nota interna...' : 'Escribe un mensaje al cliente... (Enter para enviar)'}
                      rows={3}
                      className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                        tipoMsg === 'nota' ? 'border-yellow-200 bg-yellow-50 focus:ring-yellow-400' : 'border-gray-200 focus:ring-blue-500'
                      }`}
                    />
                    <button onClick={enviar} disabled={!input.trim() || sending}
                      className={`w-9 h-9 self-end rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                        tipoMsg === 'nota' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}>
                      {sending
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto p-4 ${tabDer === 'chats' ? 'hidden' : ''}`}>

              {tabDer === 'resumen' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cliente</p>
                    <p className="font-semibold text-gray-900">{lead.cliente?.nombre ?? '—'}</p>
                    {lead.cliente?.celular && <p className="text-sm text-gray-600">{lead.cliente.celular}</p>}
                    {lead.lead_source && <p className="text-xs text-gray-400 mt-1">Origen: {lead.lead_source}</p>}
                    {lead.cliente?.id && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <a href={`/admin/clientes/${lead.cliente.id}`} className="text-xs text-blue-600 hover:underline">
                          Ver perfil completo →
                        </a>
                        <button onClick={() => setVincularOpen(true)} className="text-xs text-purple-600 hover:underline">
                          🔗 Vincular a otro cliente
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos de la venta</p>
                      {saving && <span className="text-[10px] text-gray-400">Guardando...</span>}
                      {savedOk && !saving && (
                        <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Guardado
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500">Etapa</label>
                        <select value={etapa} onChange={e => autoSaveEtapa(e.target.value as EtapaVenta)}
                          disabled={saving}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5 disabled:opacity-60">
                          {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Asignado a</label>
                        {esGerencia ? (
                          <select value={assignedTo} onChange={e => autoSaveAssigned(e.target.value)}
                            disabled={saving}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5 disabled:opacity-60">
                            <option value="">Sin asignar</option>
                            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                          </select>
                        ) : (
                          <p className="text-sm text-gray-700 mt-0.5">
                            {usuarios.find(u => u.id === assignedTo)?.nombre ?? 'Sin asignar'}
                            <span className="text-xs text-gray-400 ml-1">(solo Gerencia puede cambiarlo)</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <ResumenTab
                    clienteId={lead.id}
                    tenantId={tenantId}
                    usuarioId={profile?.id ?? ''}
                    onProximaAccionChange={(proxAccion, proxFecha) => onLeadUpdate?.(lead.id, { proxima_accion: proxAccion, proxima_accion_fecha: proxFecha })}
                  />

                  {ordenes.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Historial de servicio técnico ({ordenes.length})
                      </p>
                      {ordenes.map(o => (
                        <div key={o.id} className="bg-blue-50 rounded-lg px-3 py-2 mb-1.5">
                          <p className="text-xs font-semibold text-blue-800">{formatDate(o.created_at)} · {o.estado}</p>
                          {o.descripcion_problema && <p className="text-xs text-blue-600 truncate">{o.descripcion_problema}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {lead.todas_conversaciones.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Canales activos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.todas_conversaciones.map(c => (
                          <span key={c.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-medium">
                            {CANAL_ICON[c.canal] ?? '💭'} {CANAL_LABEL[c.canal] ?? c.canal}
                            {c.no_leidos_count > 0 && (
                              <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                                {c.no_leidos_count > 9 ? '9+' : c.no_leidos_count}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tabDer === 'datos'      && <DatosClienteTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'motos'      && <MotosInteresTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'cotizacion' && <CotizacionTab clienteId={lead.id} tenantId={tenantId} clienteNombre={lead.cliente?.nombre ?? ''} clienteCelular={lead.cliente?.celular ?? ''} />}
              {tabDer === 'pago'          && <PagoTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'archivos'      && <ArchivosTab clienteId={lead.id} />}
              {tabDer === 'comentarios'   && <ComentariosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'pasos'         && <PasosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'recordatorios' && <RecordatoriosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} clienteEmail={clienteEmail} onProximaAccionChange={(proxAccion, proxFecha) => onLeadUpdate?.(lead.id, { proxima_accion: proxAccion, proxima_accion_fecha: proxFecha })} />}
              {tabDer === 'historial'     && <HistorialTab clienteId={lead.id} />}
              {tabDer === 'visibilidad' && esGerencia && <VisibilidadTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
