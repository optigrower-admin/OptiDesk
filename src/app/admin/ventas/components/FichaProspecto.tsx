'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPAS, ETAPA_MAP, ETAPA_ORDEN, ETAPAS_LEADS, ETAPAS_NECESITAN_PLACA, ETAPAS_NECESITAN_FACTURA, ETAPAS_NECESITAN_FECHA_ENTREGA, ETAPAS_POSVENTA, type EtapaVenta } from '@/lib/ventas/pipeline'
import { showGlobalLoading, hideGlobalLoading } from '@/lib/globalLoading'
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
  onLeadUpdate?: (id: string, updates: { proxima_accion?: string | null; proxima_accion_fecha?: string | null; nombre?: string; nombre_pendiente_aprobacion?: boolean | null; etiquetas?: Etiqueta[]; placa?: string | null; celular?: string | null; numero_carta_negociacion?: string | null; numero_factura?: string | null; fecha_entrega?: string | null; assigned_to?: string | null; alistamientoOrdenId?: string | null; creditoAprobadoEntidad?: string | null; creditoRechazadoEntidades?: string[] }) => void
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

type TabDerecha = 'gestion' | 'resumen' | 'datos' | 'chats' | 'motos' | 'cotizacion' | 'archivos' | 'pasos' | 'historial' | 'visibilidad'

const TABS: { id: TabDerecha; label: string; icon: string }[] = [
  { id: 'resumen',    label: 'Resumen',    icon: '📋' },
  { id: 'datos',      label: 'Datos',      icon: '🪪' },
  { id: 'chats',      label: 'Chats',      icon: '📱' },
  { id: 'motos',      label: 'Motos',      icon: '🏍️' },
  { id: 'cotizacion', label: 'Cotización', icon: '📄' },
  { id: 'archivos',   label: 'Archivos',   icon: '📎' },
  { id: 'pasos',      label: 'Pasos',      icon: '✅' },
]
const TABS_GERENCIA: { id: TabDerecha; label: string; icon: string }[] = [
  { id: 'historial',   label: 'Historial',   icon: '📅' },
  { id: 'visibilidad', label: 'Visibilidad', icon: '🔒' },
]

export default function FichaProspecto({ lead, tenantId, onClose, onEtapaChange, onLeadUpdate, onLeadDelete }: Props) {
  const supabase = createClient()
  const { profile } = useAuth()
  const endRef   = useRef<HTMLDivElement>(null)
  const rolNorm = (profile?.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'

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
  const [flujoModalOpen, setFlujoModalOpen] = useState(false)
  const [flujos, setFlujos] = useState<{ id: string; nombre: string; trigger_tipo: string }[]>([])
  const [iniciandoFlujo, setIniciandoFlujo] = useState(false)

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
  const [bloqueoMsg, setBloqueoMsg] = useState<string | null>(null)

  useEffect(() => {
    setAprobacionStatus(lead.estadoAprobacionMatricula ?? 'pendiente')
  }, [lead.id])

  // Panel lateral izquierdo
  const [proximaAccion,   setProximaAccion]   = useState(lead.proxima_accion ?? '')
  const [proximaFecha,    setProximaFecha]     = useState(
    lead.proxima_accion_fecha ? lead.proxima_accion_fecha.slice(0, 16) : ''
  )
  const [notaRapida,      setNotaRapida]       = useState('')
  const [reminderNota,    setReminderNota]     = useState('')
  const [reminderFecha,   setReminderFecha]    = useState('')
  const [showReminder,    setShowReminder]     = useState(false)
  const [savingPanel,     setSavingPanel]      = useState(false)
  const [savedPanel,      setSavedPanel]       = useState(false)
  const [isMobile,        setIsMobile]         = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Actividad (registro + cambios de etapa)
  type EtapaMovimiento = { etapa_anterior: string | null; etapa_nueva: string; created_at: string }
  const [historialEtapas, setHistorialEtapas]         = useState<EtapaMovimiento[]>([])
  const [clienteRegistradoEn, setClienteRegistradoEn] = useState<string | null>(null)

  // Celular
  const [celularActual, setCelularActual]   = useState(lead.cliente?.celular ?? '')
  const [celularInput, setCelularInput]     = useState(lead.cliente?.celular ?? '')
  const [savingCelular, setSavingCelular]   = useState(false)

  // Placa
  const [placaActual, setPlacaActual]       = useState(lead.cliente?.placa ?? '')
  const [placaInput, setPlacaInput]         = useState(lead.cliente?.placa ?? '')
  const [editandoPlaca, setEditandoPlaca]   = useState(false)
  const [savingPlaca, setSavingPlaca]       = useState(false)

  // Carta de negociación
  const [cartaActual, setCartaActual]       = useState(lead.numero_carta_negociacion ?? '')
  const [cartaInput, setCartaInput]         = useState(lead.numero_carta_negociacion ?? '')
  const [editandoCarta, setEditandoCarta]   = useState(false)
  const [savingCarta, setSavingCarta]       = useState(false)

  // Factura
  const [facturaActual, setFacturaActual]   = useState(lead.numero_factura ?? '')
  const [facturaInput, setFacturaInput]     = useState(lead.numero_factura ?? '')
  const [editandoFactura, setEditandoFactura] = useState(false)
  const [savingFactura, setSavingFactura]   = useState(false)

  // Fecha de entrega
  const [fechaEntregaActual, setFechaEntregaActual] = useState(lead.fecha_entrega ?? '')
  const [fechaEntregaInput, setFechaEntregaInput]   = useState(lead.fecha_entrega ?? '')
  const [editandoFechaEntrega, setEditandoFechaEntrega] = useState(false)
  const [savingFechaEntrega, setSavingFechaEntrega] = useState(false)

  // Alistamiento manual
  const [alistamientoOrdenId, setAlistamientoOrdenId] = useState<string | null>(lead.alistamientoOrdenId ?? null)
  const [editandoAlistamiento, setEditandoAlistamiento] = useState(false)
  const [ordenesUMA, setOrdenesUMA]           = useState<{ id: string; created_at: string; estado: string }[]>([])
  const [loadingOrdenesUMA, setLoadingOrdenesUMA] = useState(false)
  const [ordenesUMALoaded, setOrdenesUMALoaded]   = useState(false)

  // Campos editables — tab Resumen
  const [etapa, setEtapa]         = useState<EtapaVenta>(lead.etapa_venta)
  const [assignedTo, setAssignedTo] = useState('')

  // Derivados de alerta — usan `etapa` (estado local) para que los campos aparezcan de inmediato
  const sinCelular          = (ETAPAS_LEADS as EtapaVenta[]).includes(lead.etapa_venta) && !celularActual
  const enEtapaConPlaca     = (ETAPAS_NECESITAN_PLACA as EtapaVenta[]).includes(etapa)
  const enEtapaAlistamiento    = etapa === 'espera_entrega' || etapa === 'entregada'
  const tieneAlistamientoFinal = lead.tieneAlistamiento === true || !!alistamientoOrdenId
  const enEtapaFactura         = (ETAPAS_NECESITAN_FACTURA as EtapaVenta[]).includes(etapa)
  const enEtapaFechaEntrega    = (ETAPAS_NECESITAN_FECHA_ENTREGA as EtapaVenta[]).includes(etapa)
  // Carta de negociación aplica en las mismas etapas que la factura
  const enEtapaCarta           = enEtapaFactura

  const cargar = useCallback(async () => {
    const [{ data: msgs }, { data: ords }, { data: us }, { data: cliente }, { data: etapasHist }] = await Promise.all([
      convActivaId
        ? supabase.from('mensajes')
            .select('id,direccion,tipo,contenido,created_at,estado_envio,enviado_por,usuarios(nombre,email,rol)')
            .eq('conversacion_id', convActivaId).order('created_at').limit(200)
        : Promise.resolve({ data: [] }),
      supabase.from('ordenes').select('id,created_at,estado,descripcion_problema')
        .eq('cliente_id', lead.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('usuarios').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).eq('es_asesor', true),
      supabase.from('clientes').select('email, assigned_to, created_at').eq('id', lead.id).single(),
      supabase.from('historial_etapas_cliente')
        .select('etapa_anterior, etapa_nueva, created_at')
        .eq('cliente_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setMensajes((msgs ?? []) as unknown as Mensaje[])
    setOrdenes((ords ?? []) as Orden[])
    setUsuarios((us ?? []) as { id: string; nombre: string }[])
    setClienteEmail(cliente?.email ?? null)
    setAssignedTo(cliente?.assigned_to ?? '')
    setClienteRegistradoEn(cliente?.created_at ?? null)
    setHistorialEtapas((etapasHist ?? []) as EtapaMovimiento[])
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

  async function abrirModalFlujo() {
    setFlujoModalOpen(true)
    if (flujos.length === 0) {
      const { data } = await supabase
        .from('flujos_automatizacion')
        .select('id, nombre, trigger_tipo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre')
      setFlujos((data ?? []) as { id: string; nombre: string; trigger_tipo: string }[])
    }
  }

  async function iniciarFlujo(flujoId: string) {
    if (!convActivaId) { alert('Este cliente no tiene conversación activa.'); return }
    setIniciandoFlujo(true)
    try {
      const res = await fetch('/api/admin/flujos/ejecutar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: convActivaId, cliente_id: lead.id, flujo_id: flujoId, trigger_tipo: 'mensaje_nuevo' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error')
      setFlujoModalOpen(false)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al iniciar el flujo')
    } finally {
      setIniciandoFlujo(false)
    }
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
    if (ETAPA_ORDEN[newEtapa] > ETAPA_ORDEN['aprobado_matricula'] &&
        lead.estadoAprobacionMatricula !== 'aprobado') {
      setBloqueoMsg('Debes pedir aprobación para matricular para poder cambiar de etapa')
      return
    }
    const prev = etapa
    setEtapa(newEtapa)
    showGlobalLoading()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ventas/guardar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: lead.id, etapa_venta: newEtapa, etapa_venta_orden: ETAPA_ORDEN[newEtapa] }),
      })
      if (res.ok) {
        onEtapaChange(lead.id, newEtapa)
        mostrarGuardado()
        await logCambio('etapa', ETAPA_MAP[prev]?.label ?? prev, ETAPA_MAP[newEtapa]?.label ?? newEtapa)
      } else {
        setEtapa(prev)
      }
    } catch {
      setEtapa(prev)
    } finally { setSaving(false); hideGlobalLoading() }
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
        onLeadUpdate?.(lead.id, { assigned_to: newId || null })
        const newNombre = usuarios.find(u => u.id === newId)?.nombre ?? 'Sin asignar'
        await logCambio('asignado_a', prevNombre, newNombre)
      }
    } finally { setSaving(false) }
  }

  const handleRenombrar = async () => {
    const nombre = nuevoNombre.trim().toUpperCase()
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
    showGlobalLoading()
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
    hideGlobalLoading()
  }

  const guardarCarta = async () => {
    const carta = cartaInput.trim()
    if (!carta || carta === cartaActual) { setEditandoCarta(false); return }
    showGlobalLoading()
    setSavingCarta(true)
    const { error } = await supabase.from('clientes').update({ numero_carta_negociacion: carta }).eq('id', lead.id).eq('tenant_id', tenantId)
    if (error) {
      alert(`No se pudo guardar la carta de negociación: ${error.message}`)
      setCartaInput(cartaActual)
    } else {
      await logCambio('carta_negociacion', cartaActual || null, carta)
      setCartaActual(carta)
      setCartaInput(carta)
      setEditandoCarta(false)
      onLeadUpdate?.(lead.id, { numero_carta_negociacion: carta })
      mostrarGuardado()
    }
    setSavingCarta(false)
    hideGlobalLoading()
  }

  const guardarPlaca = async () => {
    const pl = placaInput.trim().toUpperCase()
    if (!pl || pl === placaActual) { setEditandoPlaca(false); return }
    showGlobalLoading()
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
    hideGlobalLoading()
  }

  const guardarFactura = async () => {
    const fac = facturaInput.trim().toUpperCase()
    if (!fac || fac === facturaActual) { setEditandoFactura(false); return }
    showGlobalLoading()
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
    hideGlobalLoading()
  }

  const guardarFechaEntrega = async () => {
    const fecha = fechaEntregaInput.trim()
    if (!fecha || fecha === fechaEntregaActual) { setEditandoFechaEntrega(false); return }
    showGlobalLoading()
    setSavingFechaEntrega(true)
    const { error } = await supabase.from('clientes').update({ fecha_entrega: fecha }).eq('id', lead.id).eq('tenant_id', tenantId)
    if (error) {
      alert(`No se pudo guardar la fecha de entrega: ${error.message}`)
      setFechaEntregaInput(fechaEntregaActual)
    } else {
      await logCambio('fecha_entrega', fechaEntregaActual || null, fecha)
      setFechaEntregaActual(fecha)
      setFechaEntregaInput(fecha)
      setEditandoFechaEntrega(false)
      onLeadUpdate?.(lead.id, { fecha_entrega: fecha })
      mostrarGuardado()
    }
    setSavingFechaEntrega(false)
    hideGlobalLoading()
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
    onLeadUpdate?.(lead.id, { alistamientoOrdenId: ordenId })
  }

  const desvincularAlistamiento = async () => {
    await supabase.from('clientes').update({ alistamiento_orden_id: null }).eq('id', lead.id).eq('tenant_id', tenantId)
    setAlistamientoOrdenId(null)
    setOrdenesUMALoaded(false)
    setEditandoAlistamiento(false)
    onLeadUpdate?.(lead.id, { alistamientoOrdenId: null })
  }

  const actualizarAprobacion = async (status: 'pendiente' | 'aprobado' | 'rechazado') => {
    if (!esGerencia) {
      setBloqueoMsg('Solo gerencia o el dueño pueden aprobar o rechazar la matrícula. Pídeles que cambien el estado.')
      return
    }
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

  const panelToast = useCallback(() => { setSavedPanel(true); setTimeout(() => setSavedPanel(false), 2000) }, [])

  const guardarProximaAccionPanel = async () => {
    const fecha = proximaFecha ? new Date(proximaFecha).toISOString() : null
    setSavingPanel(true)
    await supabase.from('clientes').update({ proxima_accion: proximaAccion || null, proxima_accion_fecha: fecha }).eq('id', lead.id)
    onLeadUpdate?.(lead.id, { proxima_accion: proximaAccion || null, proxima_accion_fecha: fecha })
    setSavingPanel(false); panelToast()
  }

  const guardarNotaRapidaPanel = async () => {
    if (!notaRapida.trim() || !profile?.id) return
    setSavingPanel(true)
    await supabase.from('comentarios').insert({
      cliente_id: lead.cliente?.id ?? lead.id, tenant_id: tenantId,
      usuario_id: profile.id, contenido: notaRapida.trim(), tipo: 'nota_interna',
    })
    setNotaRapida(''); setSavingPanel(false); panelToast()
  }

  const guardarReminderPanel = async () => {
    if (!reminderFecha || !profile?.id) return
    setSavingPanel(true)
    await supabase.from('recordatorios').insert({
      cliente_id: lead.cliente?.id ?? lead.id, tenant_id: tenantId,
      asignado_a: profile.id, nota: reminderNota || null,
      fecha_recordatorio: new Date(reminderFecha).toISOString(), completado: false,
    })
    setReminderNota(''); setReminderFecha(''); setShowReminder(false); setSavingPanel(false); panelToast()
  }

  const etapaActual = ETAPA_MAP[etapa]

  const posventaSet = new Set<EtapaVenta>(['primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado'])
  const gruposEtapa = (
    <>
      <optgroup label="── Etapas de Ventas ──">
        {ETAPAS.filter(e => !posventaSet.has(e.id)).map(e => (
          <option key={e.id} value={e.id} style={{ background: e.color, color: '#fff' }}>{e.label}</option>
        ))}
      </optgroup>
      <optgroup label="── Post-Venta ──">
        {ETAPAS.filter(e => posventaSet.has(e.id)).map(e => (
          <option key={e.id} value={e.id} style={{ background: e.color, color: '#fff' }}>{e.label}</option>
        ))}
      </optgroup>
    </>
  )

  return (
    <>
    {/* Modal selección de flujo */}
    {flujoModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
          <h3 className="font-bold text-gray-900 mb-1">Iniciar flujo</h3>
          <p className="text-xs text-gray-500 mb-4">Selecciona la automatización a ejecutar para este cliente.</p>
          {flujos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin flujos activos</p>
          ) : (
            <div className="space-y-2">
              {flujos.map(f => (
                <button key={f.id} disabled={iniciandoFlujo} onClick={() => iniciarFlujo(f.id)}
                  className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50">
                  <p className="text-sm font-semibold text-gray-900">{f.nombre}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Trigger: {f.trigger_tipo.replace(/_/g, ' ')}</p>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setFlujoModalOpen(false)} disabled={iniciandoFlujo}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          </div>
          {iniciandoFlujo && <p className="text-xs text-indigo-600 text-center mt-2">Iniciando flujo...</p>}
        </div>
      </div>
    )}
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full sm:max-w-6xl h-full sm:h-[92vh] flex flex-col overflow-hidden">

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
            {saving && <span className="text-[10px] text-gray-400">Guardando...</span>}
            {savedOk && !saving && <span className="text-[10px] text-green-600 font-semibold">✓ Guardado</span>}
            {convActivaId && (
              <button
                onClick={abrirModalFlujo}
                title="Iniciar flujo de automatización"
                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors">
                ▶ Flujo
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

        {/* Body con panel izquierdo */}
        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">

          {/* ── Panel izquierdo oscuro — oculto en móvil ── */}
          <div className="hidden sm:flex sm:w-64 flex-shrink-0 bg-[#1a2235] border-r border-[#2a3550] flex-col overflow-y-auto">
            {/* Saved toast */}
            {savedPanel && (
              <div className="absolute top-3 left-16 z-10 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">✓ Guardado</div>
            )}

            <div className="flex-1 px-3 py-3 space-y-3">

              {/* Etapa */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Etapa</label>
                <select value={etapa} onChange={e => autoSaveEtapa(e.target.value as EtapaVenta)} disabled={saving}
                  className="w-full text-xs rounded-lg px-2 py-1.5 font-bold text-white border border-[#2a3550] focus:outline-none disabled:opacity-60"
                  style={{ background: etapaActual.color }}>
                  {gruposEtapa}
                </select>
              </div>

              {/* Asesor */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Asesor</label>
                {esGerencia ? (
                  <select value={assignedTo} onChange={e => autoSaveAssigned(e.target.value)} disabled={saving}
                    className="w-full text-xs bg-[#232f47] border border-[#2a3550] rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none disabled:opacity-60">
                    <option value="">Sin asignar</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-slate-300">{usuarios.find(u => u.id === assignedTo)?.nombre ?? 'Sin asignar'}</p>
                )}
              </div>

              <div className="border-t border-[#2a3550]" />

              {/* Próxima acción */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Próxima acción</label>
                <input value={proximaAccion} onChange={e => setProximaAccion(e.target.value)}
                  placeholder="Acción a seguir..."
                  className="w-full text-xs bg-[#232f47] border border-[#2a3550] rounded-lg px-2 py-1.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1" />
                <input type="datetime-local" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)}
                  className="w-full text-[10px] bg-[#232f47] border border-[#2a3550] rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1" />
                <button onClick={guardarProximaAccionPanel} disabled={savingPanel}
                  className="w-full py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-40">
                  {savingPanel ? '...' : 'Guardar acción'}
                </button>
              </div>

              <div className="border-t border-[#2a3550]" />

              {/* Nota rápida */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nota rápida</label>
                <textarea value={notaRapida} onChange={e => setNotaRapida(e.target.value)}
                  rows={2} placeholder="Nota interna..."
                  className="w-full text-xs bg-[#232f47] border border-[#2a3550] rounded-lg px-2 py-1.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none mb-1" />
                <button onClick={guardarNotaRapidaPanel} disabled={savingPanel || !notaRapida.trim()}
                  className="w-full py-1 text-[10px] font-bold bg-[#2a3550] hover:bg-[#334466] text-slate-200 rounded-lg transition-colors disabled:opacity-40">
                  💬 Guardar nota
                </button>
              </div>

              {/* Recordatorio */}
              <div>
                <button onClick={() => setShowReminder(v => !v)}
                  className="w-full py-1 text-[10px] font-bold bg-amber-900/40 hover:bg-amber-900/60 text-amber-400 border border-amber-800/50 rounded-lg transition-colors">
                  ⏰ {showReminder ? 'Cancelar' : 'Recordatorio'}
                </button>
                {showReminder && (
                  <div className="mt-1.5 space-y-1">
                    <input type="datetime-local" value={reminderFecha} onChange={e => setReminderFecha(e.target.value)}
                      className="w-full text-[10px] bg-[#232f47] border border-[#2a3550] rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none" />
                    <input type="text" value={reminderNota} onChange={e => setReminderNota(e.target.value)}
                      placeholder="Nota del recordatorio"
                      className="w-full text-xs bg-[#232f47] border border-[#2a3550] rounded-lg px-2 py-1.5 text-slate-100 placeholder:text-slate-500 focus:outline-none" />
                    <button onClick={guardarReminderPanel} disabled={savingPanel || !reminderFecha}
                      className="w-full py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-40">
                      Crear recordatorio
                    </button>
                  </div>
                )}
              </div>

              {/* Alertas — click para ir al formulario en pestaña Resumen */}
              <div className="space-y-1 pt-1">
                {sinCelular && (
                  <button onClick={() => setTabDer('datos')}
                    className="w-full text-left text-[9px] font-bold text-orange-300 bg-orange-900/30 border border-orange-700/40 rounded-lg px-2 py-1.5 hover:bg-orange-900/50 transition-colors">
                    ⚠ Sin celular → Datos
                  </button>
                )}
                {enEtapaConPlaca && !placaActual && (
                  <button onClick={() => setTabDer('resumen')}
                    className="w-full text-left text-[9px] font-bold text-red-300 bg-red-900/30 border border-red-700/40 rounded-lg px-2 py-1.5 hover:bg-red-900/50 transition-colors">
                    ⚠ Sin placa → Resumen
                  </button>
                )}
                {enEtapaAlistamiento && !tieneAlistamientoFinal && (
                  <button onClick={() => setTabDer('resumen')}
                    className="w-full text-left text-[9px] font-bold text-red-300 bg-red-900/30 border border-red-700/40 rounded-lg px-2 py-1.5 hover:bg-red-900/50 transition-colors">
                    ⚠ Sin alistamiento → Resumen
                  </button>
                )}
                {enEtapaCarta && !cartaActual && (
                  <button onClick={() => setTabDer('resumen')}
                    className="w-full text-left text-[9px] font-bold text-yellow-300 bg-yellow-900/30 border border-yellow-700/40 rounded-lg px-2 py-1.5 hover:bg-yellow-900/50 transition-colors">
                    ⚠ Sin carta negociación → Resumen
                  </button>
                )}
                {enEtapaFactura && !facturaActual && (
                  <button onClick={() => setTabDer('resumen')}
                    className="w-full text-left text-[9px] font-bold text-yellow-300 bg-yellow-900/30 border border-yellow-700/40 rounded-lg px-2 py-1.5 hover:bg-yellow-900/50 transition-colors">
                    ⚠ Sin factura → Resumen
                  </button>
                )}
              </div>
            </div>

            {/* Footer panel: eliminar */}
            {(rolNorm === 'gerencia' || rolNorm === 'dueno') && (
              <div className="px-3 py-3 border-t border-[#2a3550] flex-shrink-0">
                <button onClick={() => { setConfirmDeleteInput(''); setConfirmDelete(true) }}
                  className="w-full py-1.5 text-[10px] font-bold text-red-400 bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 rounded-lg transition-colors">
                  🗑 Sacar de seguimiento
                </button>
              </div>
            )}
          </div>

          {/* ── Panel derecho: tabs + contenido ── */}
          <div className="flex-1 flex flex-col min-w-0">

          {/* ── Tabs en fila única ── */}
          <div className="flex border-b flex-shrink-0 overflow-x-auto">
            {isMobile && (
              <button onClick={() => setTabDer('gestion')}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  tabDer === 'gestion'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                ⚙️ Gestión
              </button>
            )}
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

          {/* ── Alerta: Sin celular (en header de la zona derecha) ── */}
          {sinCelular && (
            <div className="border-b px-4 py-2.5 bg-orange-50 flex-shrink-0">
              <p className="text-xs font-bold text-orange-700 mb-1">⚠ Sin número de celular</p>
              <div className="flex items-center gap-2">
                <input
                  value={celularInput}
                  onChange={e => setCelularInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') guardarCelular() }}
                  onBlur={guardarCelular}
                  placeholder="Ej: 3001234567"
                  type="tel"
                  className="flex-1 border border-orange-300 bg-white rounded-xl px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                {savingCelular && <span className="text-xs text-orange-500 flex-shrink-0">Guardando...</span>}
              </div>
            </div>
          )}

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

            {/* ── Barra: Carta · Placa · Alistamiento · Factura · Fecha entrega · Aprobación ── */}
            {(enEtapaCarta || enEtapaConPlaca || enEtapaAlistamiento || enEtapaFactura || enEtapaFechaEntrega || lead.etapa_venta === 'aprobado_matricula') && (
              <div className="mb-4 space-y-2">

                {/* Fila de pills */}
                <div className="flex flex-wrap gap-1.5">
                  {enEtapaCarta && !editandoCarta && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border font-bold ${
                      cartaActual ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-orange-50 border-orange-200 text-orange-700'
                    }`}>
                      {cartaActual ? `📝 Carta ${cartaActual}` : '⚠ Sin carta negociación'}
                      {cartaActual && (
                        <button onClick={() => setEditandoCarta(true)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity text-[11px]">✏️</button>
                      )}
                    </span>
                  )}

                  {enEtapaConPlaca && !editandoPlaca && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border font-bold ${
                      placaActual ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      {placaActual ? `🏍️ ${placaActual}` : '⚠ Sin placa'}
                      {esGerencia && (
                        <button onClick={() => setEditandoPlaca(true)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity text-[11px]">✏️</button>
                      )}
                    </span>
                  )}

                  {enEtapaAlistamiento && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border font-bold ${
                      tieneAlistamientoFinal ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      {tieneAlistamientoFinal ? '✅ Alistamiento' : '⚠ Sin alistamiento'}
                      {tieneAlistamientoFinal && alistamientoOrdenId && (
                        <a href={`/admin/ordenes/${alistamientoOrdenId}`} className="hover:underline ml-0.5">→</a>
                      )}
                      {tieneAlistamientoFinal && !alistamientoOrdenId && (
                        <button onClick={cargarOrdenesUMA} disabled={loadingOrdenesUMA}
                          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity text-[11px]">
                          {loadingOrdenesUMA ? '⏳' : '🔧'}
                        </button>
                      )}
                      {tieneAlistamientoFinal && esGerencia && (
                        <button onClick={() => { setEditandoAlistamiento(true); cargarOrdenesUMA() }}
                          className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity text-[11px]">✏️</button>
                      )}
                    </span>
                  )}

                  {enEtapaFactura && !editandoFactura && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border font-bold ${
                      facturaActual ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-orange-50 border-orange-200 text-orange-700'
                    }`}>
                      {facturaActual ? `🧾 ${facturaActual}` : '⚠ Sin factura'}
                      {esGerencia && facturaActual && (
                        <button onClick={() => setEditandoFactura(true)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity text-[11px]">✏️</button>
                      )}
                    </span>
                  )}

                  {enEtapaFechaEntrega && !editandoFechaEntrega && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border font-bold ${
                      fechaEntregaActual ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-orange-50 border-orange-200 text-orange-700'
                    }`}>
                      {fechaEntregaActual
                        ? `📅 ${new Date(fechaEntregaActual + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : '⚠ Sin fecha entrega'}
                      {fechaEntregaActual && (
                        <button onClick={() => setEditandoFechaEntrega(true)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity text-[11px]">✏️</button>
                      )}
                    </span>
                  )}
                </div>

                {/* Formulario inline: Carta de negociación */}
                {enEtapaCarta && (!cartaActual || editandoCarta) && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                    {!cartaActual && <p className="text-[11px] text-orange-600 mb-1.5">Ingresa el número de carta de negociación de esta venta.</p>}
                    <div className="flex gap-2">
                      <input value={cartaInput} onChange={e => setCartaInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') guardarCarta() }}
                        onBlur={guardarCarta}
                        placeholder="Ej: 00123"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="flex-1 border border-orange-300 bg-white rounded-lg px-3 py-1.5 text-sm font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      {savingCarta && <span className="text-xs text-orange-500 self-center">Guardando...</span>}
                      {editandoCarta && !savingCarta && (
                        <button onClick={() => { setEditandoCarta(false); setCartaInput(cartaActual) }}
                          className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">✕</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Formulario inline: Placa */}
                {enEtapaConPlaca && (!placaActual || editandoPlaca) && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    {!placaActual && <p className="text-[11px] text-red-600 mb-1.5">Ingresa la placa de la moto entregada a este cliente.</p>}
                    <div className="flex gap-2">
                      <input value={placaInput} onChange={e => setPlacaInput(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') guardarPlaca() }}
                        onBlur={guardarPlaca}
                        placeholder="ABC123"
                        className="flex-1 border border-red-300 bg-white rounded-lg px-3 py-1.5 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-red-400" />
                      {savingPlaca && <span className="text-xs text-red-500 self-center">Guardando...</span>}
                      {editandoPlaca && !savingPlaca && (
                        <button onClick={() => { setEditandoPlaca(false); setPlacaInput(placaActual) }}
                          className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">✕</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Formulario inline: Alistamiento sin vincular */}
                {enEtapaAlistamiento && !tieneAlistamientoFinal && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-[11px] text-red-600 mb-2">No se encontró una orden UMA de alistamiento. Vincúlala o créala en Servicio Técnico.</p>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={cargarOrdenesUMA} disabled={loadingOrdenesUMA}
                        className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
                        {loadingOrdenesUMA ? '⏳ Cargando...' : '📎 Ver órdenes UMA'}
                      </button>
                      <a href="/admin/ordenes"
                        className="flex-1 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs font-bold text-center hover:bg-red-50 transition-colors">
                        ➕ Crear en Serv. Técnico
                      </a>
                    </div>
                    {ordenesUMALoaded && (
                      <div className="mt-2 space-y-1.5">
                        {ordenesUMA.length === 0 ? (
                          <p className="text-xs text-red-400 text-center py-1">No hay órdenes UMA para este cliente.</p>
                        ) : ordenesUMA.map(o => (
                          <button key={o.id} onClick={() => vincularAlistamiento(o.id)}
                            className="w-full flex items-center justify-between bg-white border border-red-200 hover:border-red-500 rounded-lg px-2.5 py-1.5 text-xs transition-colors text-left">
                            <span className="font-mono text-gray-500">#{o.id.slice(-8).toUpperCase()}</span>
                            <span className="text-gray-600">{new Date(o.created_at).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' })}</span>
                            <span className={`font-semibold px-1.5 py-0.5 rounded-full text-[10px] ${o.estado === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {o.estado}
                            </span>
                            <span className="font-bold text-red-600">Vincular →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Alistamiento auto-detectado: listado de órdenes cuando se expande */}
                {enEtapaAlistamiento && tieneAlistamientoFinal && !alistamientoOrdenId && ordenesUMALoaded && !editandoAlistamiento && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 space-y-1">
                    {ordenesUMA.length === 0 ? (
                      <p className="text-xs text-gray-500">No se encontraron órdenes UMA para este cliente.</p>
                    ) : ordenesUMA.map(o => (
                      <a key={o.id} href={`/admin/ordenes/${o.id}`}
                        className="flex items-center gap-1.5 text-xs font-semibold text-green-700 underline hover:text-green-900 transition-colors">
                        🔧 Orden #{o.id.slice(-8).toUpperCase()} ({o.estado}) →
                      </a>
                    ))}
                  </div>
                )}

                {/* Alistamiento vinculado: acceso rápido a la entrada de S.T. */}
                {enEtapaAlistamiento && alistamientoOrdenId && !editandoAlistamiento && (
                  <a
                    href={`/admin/ordenes/${alistamientoOrdenId}`}
                    className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100 hover:text-green-900 transition-colors group"
                  >
                    <span className="flex items-center gap-1.5">
                      🔧 Ver alistamiento vinculado
                      {ordenesUMA.find(o => o.id === alistamientoOrdenId) && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ordenesUMA.find(o => o.id === alistamientoOrdenId)?.estado === 'listo' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                          {ordenesUMA.find(o => o.id === alistamientoOrdenId)?.estado}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-green-500 group-hover:text-green-700">
                      #{alistamientoOrdenId.slice(-8).toUpperCase()} →
                    </span>
                  </a>
                )}

                {/* Panel edición de alistamiento — solo gerencia */}
                {enEtapaAlistamiento && tieneAlistamientoFinal && esGerencia && editandoAlistamiento && (
                  <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-green-800">✏️ Editar alistamiento</p>
                      <button onClick={() => setEditandoAlistamiento(false)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors">✕ Cerrar</button>
                    </div>
                    <button onClick={desvincularAlistamiento}
                      className="w-full py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors">
                      🗑 Desvincular alistamiento actual
                    </button>
                    <p className="text-[11px] text-green-700 font-semibold">O vincular a otra orden UMA:</p>
                    {loadingOrdenesUMA ? (
                      <p className="text-xs text-gray-500">⏳ Cargando órdenes...</p>
                    ) : ordenesUMA.length === 0 ? (
                      <p className="text-xs text-gray-500">No se encontraron órdenes UMA para este cliente.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ordenesUMA.map(o => (
                          <button key={o.id} onClick={() => { vincularAlistamiento(o.id); setEditandoAlistamiento(false) }}
                            className="w-full flex items-center justify-between bg-white border border-green-200 hover:border-green-500 rounded-lg px-2.5 py-1.5 text-xs transition-colors text-left">
                            <span className="font-mono text-gray-500">#{o.id.slice(-8).toUpperCase()}</span>
                            <span className="text-gray-600">{new Date(o.created_at).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' })}</span>
                            <span className={`font-semibold px-1.5 py-0.5 rounded-full text-[10px] ${o.estado === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {o.estado}
                            </span>
                            <span className="font-bold text-green-700">Vincular →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Formulario inline: Factura */}
                {enEtapaFactura && (!facturaActual || editandoFactura) && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                    {!facturaActual && <p className="text-[11px] text-orange-600 mb-1.5">Ingresa el número de factura de esta venta.</p>}
                    <div className="flex gap-2">
                      <input value={facturaInput} onChange={e => setFacturaInput(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') guardarFactura() }}
                        onBlur={guardarFactura}
                        placeholder="Ej: FAC-00123"
                        className="flex-1 border border-orange-300 bg-white rounded-lg px-3 py-1.5 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      {savingFactura && <span className="text-xs text-orange-500 self-center">Guardando...</span>}
                      {editandoFactura && !savingFactura && (
                        <button onClick={() => { setEditandoFactura(false); setFacturaInput(facturaActual) }}
                          className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">✕</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Formulario inline: Fecha de entrega */}
                {enEtapaFechaEntrega && (!fechaEntregaActual || editandoFechaEntrega) && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                    {!fechaEntregaActual && <p className="text-[11px] text-sky-600 mb-1.5">Ingresa la fecha de entrega de la moto al cliente.</p>}
                    <div className="flex gap-2">
                      <input type="date" value={fechaEntregaInput} onChange={e => setFechaEntregaInput(e.target.value)}
                        onBlur={guardarFechaEntrega}
                        className="flex-1 border border-sky-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
                      {savingFechaEntrega && <span className="text-xs text-sky-500 self-center">Guardando...</span>}
                      {editandoFechaEntrega && !savingFechaEntrega && (
                        <button onClick={() => { setEditandoFechaEntrega(false); setFechaEntregaInput(fechaEntregaActual) }}
                          className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">✕</button>
                      )}
                      {!editandoFechaEntrega && fechaEntregaInput && (
                        <button onClick={guardarFechaEntrega}
                          className="px-2.5 py-1.5 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700 font-bold">Guardar</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Aprobación para matrícula */}
                {lead.etapa_venta === 'aprobado_matricula' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">Estado de aprobación para matrícula</p>
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

              </div>
            )}

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

                  <ComentariosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />

                  <ResumenTab
                    clienteId={lead.id}
                    tenantId={tenantId}
                    usuarioId={profile?.id ?? ''}
                    onProximaAccionChange={(proxAccion, proxFecha) => onLeadUpdate?.(lead.id, { proxima_accion: proxAccion, proxima_accion_fecha: proxFecha })}
                    onCreditoChange={(aprobada, rechazadas) => onLeadUpdate?.(lead.id, { creditoAprobadoEntidad: aprobada, creditoRechazadoEntidades: rechazadas })}
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

              {tabDer === 'datos'      && <DatosClienteTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''}
                onClienteUpdate={({ nombre, celular }) => onLeadUpdate?.(lead.id, {
                  ...(nombre  ? { nombre }  : {}),
                  ...(celular ? { celular } : {}),
                })} />}
              {tabDer === 'motos'      && <MotosInteresTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'cotizacion' && <CotizacionTab clienteId={lead.id} tenantId={tenantId} clienteNombre={lead.cliente?.nombre ?? ''} clienteCelular={lead.cliente?.celular ?? ''} />}
              {tabDer === 'archivos'   && <ArchivosTab clienteId={lead.id} />}
              {tabDer === 'pasos'      && <PasosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'historial'  && <HistorialTab clienteId={lead.id} />}
              {tabDer === 'visibilidad' && esGerencia && <VisibilidadTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}

              {tabDer === 'gestion' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Etapa</label>
                    <select value={etapa} onChange={e => autoSaveEtapa(e.target.value as EtapaVenta)} disabled={saving}
                      className="w-full text-sm rounded-xl px-3 py-2.5 font-bold text-white border-0 focus:outline-none"
                      style={{ background: etapaActual.color }}>
                      {gruposEtapa}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Asesor</label>
                    {esGerencia ? (
                      <select value={assignedTo} onChange={e => autoSaveAssigned(e.target.value)} disabled={saving}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none">
                        <option value="">Sin asignar</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-700 py-1">{usuarios.find(u => u.id === assignedTo)?.nombre ?? 'Sin asignar'}</p>
                    )}
                  </div>

                  <hr className="border-gray-200" />

                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Próxima acción</label>
                    <input value={proximaAccion} onChange={e => setProximaAccion(e.target.value)}
                      placeholder="Acción a seguir..."
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <input type="datetime-local" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <button onClick={guardarProximaAccionPanel} disabled={savingPanel}
                      className="w-full py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-40">
                      {savingPanel ? '...' : 'Guardar acción'}
                    </button>
                  </div>

                  <hr className="border-gray-200" />

                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Nota rápida</label>
                    <textarea value={notaRapida} onChange={e => setNotaRapida(e.target.value)}
                      rows={3} placeholder="Nota interna..."
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    <button onClick={guardarNotaRapidaPanel} disabled={savingPanel || !notaRapida.trim()}
                      className="w-full py-2.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors disabled:opacity-40">
                      💬 Guardar nota
                    </button>
                  </div>

                  <div>
                    <button onClick={() => setShowReminder(v => !v)}
                      className="w-full py-2.5 text-sm font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl transition-colors">
                      ⏰ {showReminder ? 'Cancelar recordatorio' : 'Crear recordatorio'}
                    </button>
                    {showReminder && (
                      <div className="mt-2 space-y-2">
                        <input type="datetime-local" value={reminderFecha} onChange={e => setReminderFecha(e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none" />
                        <input type="text" value={reminderNota} onChange={e => setReminderNota(e.target.value)}
                          placeholder="Nota del recordatorio"
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none" />
                        <button onClick={guardarReminderPanel} disabled={savingPanel || !reminderFecha}
                          className="w-full py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-40">
                          Crear recordatorio
                        </button>
                      </div>
                    )}
                  </div>

                  {(sinCelular || (enEtapaCarta && !cartaActual) || (enEtapaConPlaca && !placaActual) || (enEtapaAlistamiento && !tieneAlistamientoFinal) || (enEtapaFactura && !facturaActual)) && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Alertas</p>
                      {sinCelular && <button onClick={() => setTabDer('datos')} className="w-full text-left text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">⚠ Sin celular → Datos</button>}
                      {enEtapaCarta && !cartaActual && <button onClick={() => setTabDer('resumen')} className="w-full text-left text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">⚠ Sin carta negociación → Resumen</button>}
                      {enEtapaConPlaca && !placaActual && <button onClick={() => setTabDer('resumen')} className="w-full text-left text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">⚠ Sin placa → Resumen</button>}
                      {enEtapaAlistamiento && !tieneAlistamientoFinal && <button onClick={() => setTabDer('resumen')} className="w-full text-left text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">⚠ Sin alistamiento → Resumen</button>}
                      {enEtapaFactura && !facturaActual && <button onClick={() => setTabDer('resumen')} className="w-full text-left text-sm font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5">⚠ Sin factura → Resumen</button>}
                    </div>
                  )}

                  {(rolNorm === 'gerencia' || rolNorm === 'dueno') && (
                    <button onClick={() => { setConfirmDeleteInput(''); setConfirmDelete(true) }}
                      className="w-full py-2.5 text-sm font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition-colors">
                      🗑 Sacar de seguimiento
                    </button>
                  )}
                </div>
              )}
          </div>
          </div>{/* /right panel */}
        </div>{/* /body */}
      </div>
    </div>
      {/* Modal de bloqueo: matrícula no aprobada / sin permiso */}
      {bloqueoMsg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🔒</span>
              <h2 className="font-bold text-gray-900 text-base">Acción bloqueada</h2>
            </div>
            <p className="text-sm text-gray-600 mb-5">{bloqueoMsg}</p>
            <button onClick={() => setBloqueoMsg(null)}
              className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
