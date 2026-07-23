'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ConsultaRepuestos } from '@/components/ConsultaRepuestos'
import { MediaGallery } from '@/components/MediaGallery'
import SeguimientoModal from '@/components/SeguimientoModal'
import { OrderStatus } from '@/components/OrderStatus'
import { PaymentStatus } from '@/components/PaymentStatus'
import { Badge } from '@/components/ui/Badge'
import { formatCOP } from '@/lib/utils'
import Link from 'next/link'
import { registrarAuditoria } from '@/lib/audit'
import { registrarSalida, registrarDevolucion } from '@/lib/movimientos'

interface AuditEntry {
  id: string
  tipo: string
  descripcion: string | null
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  created_at: string
  usuarios: { nombre: string; email: string } | null
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  cliente: 'Cliente', descripcion: 'Descripción', estado: 'Estado',
  manifiesta_cliente: 'Manifiesta el cliente', diagnostico: 'Diagnóstico',
  estado_pago: 'Pago', telefono: 'Teléfono', notas: 'Notas',
  valor_total: 'Total', valor_abono: 'Abono', motivo_pendiente: 'Motivo pendiente',
  numeros_orden_uma: '# Orden UMA', precio_venta: 'Precio', cantidad: 'Cantidad',
  estado_repuesto: 'Estado repuesto',
}

const AUDIT_SKIP = new Set([
  'updated_at', 'id', 'tenant_id', 'created_at', 'orden_id',
  'repuesto_uma_id', 'repuesto_externo_id', 'mecanico_id', 'metodo_pago_id',
  'subcategoria_servicio_id', 'categoria_servicio_id', 'numero_ot', 'nota_ot',
  'numero', 'tipo_orden', 'tipo_servicio', 'costo',
])

function getDiff(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const diffs: { field: string; from: string; to: string }[] = []
  for (const key of Object.keys(prev)) {
    if (AUDIT_SKIP.has(key)) continue
    if (JSON.stringify(prev[key]) === JSON.stringify(next[key])) continue
    const fmtVal = (v: unknown): string => {
      if (v === null || v === undefined) return '—'
      if (Array.isArray(v)) return (v as unknown[]).join(', ') || '—'
      if (typeof v === 'number') return v.toLocaleString('es-CO')
      return String(v)
    }
    diffs.push({ field: AUDIT_FIELD_LABELS[key] ?? key, from: fmtVal(prev[key]), to: fmtVal(next[key]) })
    if (diffs.length >= 4) break
  }
  return diffs
}

function formatAuditDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function soloDigitos(val: string) { return val.replace(/\D/g, '') }

function formatFechaCorta(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// Convierte un ISO timestamp al formato que requiere <input type="datetime-local"> (hora local del navegador)
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTelefono(digits: string): string {
  const d = soloDigitos(digits).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function formatAbonoDisplay(raw: string): string {
  const num = parseInt(soloDigitos(raw), 10)
  if (!raw || isNaN(num)) return ''
  return '$' + num.toLocaleString('es-CO')
}

function PriceInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [focused, setFocused] = useState(false)
  const displayValue = focused
    ? value
    : value ? '$' + parseInt(value || '0', 10).toLocaleString('es-CO') : ''
  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      className={className}
    />
  )
}

type EstadoOrden = 'programado' | 'falta_revision' | 'en_proceso' | 'pendiente' | 'pagado' | 'listo'
type EstadoPago = 'pagado' | 'abono' | 'pendiente'

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

interface OrdenDetalle {
  id: string
  numero: number
  placa: string | null
  cliente: string
  telefono: string | null
  estado: EstadoOrden
  estado_pago: EstadoPago
  valor_total: number
  valor_abono: number
  motivo_pendiente: string | null
  fecha_programada: string | null
  duracion_estimada_horas: number | null
  descripcion: string | null
  manifiesta_cliente: string | null
  diagnostico: string | null
  tipo_orden: string | null
  tipo_servicio: string | null
  numero_ot: string | null
  nota_ot: string | null
  notas: string | null
  numeros_orden_uma: string[]
  categoria_servicio_id: string | null
  subcategoria_servicio_id: string | null
  subcategoria_servicio_ids: string[] | null
  cliente_id: string | null
  tenant_id: string
  created_at: string
  fecha_finalizacion: string | null
  categorias_servicio: { nombre: string } | null
  subcategorias_servicio: { nombre: string } | null
  metodos_pago: { id: string; nombre: string } | null
  usuarios: { nombre: string } | null
  moto_id: string | null
  motos: { id: string; marca: string | null; modelo: string | null; año: number | null; color: string | null; kilometraje: number | null } | null
}

interface ItemOrden {
  id: string
  descripcion: string
  origen: 'uma' | 'externo' | 'mano_obra' | 'insumo'
  cantidad: number
  costo: number
  precio_venta: number
  repuesto_uma_id: string | null
  estado_repuesto: 'pedido' | 'ok' | null
  metodo_pago_id: string | null
  created_at: string
}

interface Medio {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  storage_location: 'r2' | 'drive'
  drive_url: string | null
  procesando: boolean
}

interface PagoOrden {
  id: string
  monto: number
  metodo_pago_id: string | null
  fecha: string
  notas: string | null
  metodos_pago: { nombre: string } | null
}

interface PagoProveedor {
  id: string
  monto: number
  notas: string | null
  fecha: string
  metodo_pago_id: string | null
  metodos_pago: { nombre: string } | null
}

interface ComentarioOrden {
  id: string
  comentario: string
  created_at: string
  usuario_id: string | null
  usuarios: { nombre: string } | null
}

interface LavaMotoConfig { id?: string; costo: number; precio_venta: number; activo: boolean }
interface LavaMotoOrden {
  id: string
  cantidad: number
  costo_unitario: number
  precio_venta_unitario: number
  metodo_pago_id: string | null
  pago_costo_id: string | null
  created_at: string
  metodos_pago: { nombre: string } | null
}

export default function AdminOrdenDetallePage() {
  const params = useParams()
  const ordenId = String(params.id)
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [orden, setOrden] = useState<OrdenDetalle | null>(null)
  const [items, setItems] = useState<ItemOrden[]>([])
  const [medios, setMedios] = useState<Medio[]>([])
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const [moDescripcion, setMoDescripcion] = useState('')
  const [moValor, setMoValor] = useState('')
  const [mostrarFormMo, setMostrarFormMo] = useState(false)
  const [guardandoMo, setGuardandoMo] = useState(false)
  const moListo = !!moDescripcion.trim() && !!moValor

  // Repuestos (UMA/Externo/Insumo/Porta) — se agregan con el botón "+ Agregar repuesto"
  // (modal ConsultaRepuestos), quedan en una lista (varios por orden) y se guardan
  // de inmediato, sin esperar a "Guardar cambios".
  const [showAgregarRepuesto, setShowAgregarRepuesto] = useState(false)
  const [editingItem, setEditingItem] = useState<{ id: string; descripcion: string; codigoPrefix: string; costo: string; precio: string; metodo_pago_id: string; precioMin: number | null; errMsg: string; cantidad: string } | null>(null)

  // Lavado de moto — botón "+ Agregar lavado" en la tarjeta de Pagos, con envío explícito
  // (igual a Mano de obra), no autoguardado al perder el foco.
  const [lavadoQuick, setLavadoQuick] = useState<{ cantidad: string; costo: string; valor: string; metodo: string; editId: string | null }>({ cantidad: '1', costo: '10000', valor: '15000', metodo: '', editId: null })
  const [mostrarLavado, setMostrarLavado] = useState(false)
  const [guardandoLavado, setGuardandoLavado] = useState(false)
  const lavadoFormListo = !!lavadoQuick.valor && (parseInt(lavadoQuick.cantidad || '0', 10) > 0) && (!parseInt(lavadoQuick.costo.replace(/\D/g, '') || '0', 10) || !!lavadoQuick.metodo)
  const [notas, setNotas] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [numerosOrdenUMA, setNumerosOrdenUMA] = useState<string[]>([])
  const [nuevoNumOrden, setNuevoNumOrden] = useState('')
  // Secciones colapsables (cerradas por defecto, muestran un resumen al frente)
  const [abiertoDatos, setAbiertoDatos] = useState(true)
  const [abiertoFotos, setAbiertoFotos] = useState(true)
  const [abiertoRepuestos, setAbiertoRepuestos] = useState(true)
  // Modal agregar a seguimiento ventas
  const [seguimientoOpen, setSeguimientoOpen] = useState(false)
  const [seguimientoToast, setSeguimientoToast] = useState<string | null>(null)
  const [clienteEnSeguimiento, setClienteEnSeguimiento] = useState(false)

  // Edición de datos del ingreso
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [editingOrden, setEditingOrden] = useState<'cliente' | 'descripcion' | 'categoria' | 'placa' | null>(null)
  const [editCliente, setEditCliente] = useState('')
  const [editPlaca, setEditPlaca] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editManifiestaCliente, setEditManifiestaCliente] = useState('')
  const [editDiagnostico, setEditDiagnostico] = useState('')
  const [editCategoriaId, setEditCategoriaId] = useState('')
  const [editSubcategoriaIds, setEditSubcategoriaIds] = useState<string[]>([])
  const [editTipoServicio, setEditTipoServicio] = useState<'terceros' | 'uma' | ''>('')
  const [savingOrden, setSavingOrden] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  const [estado, setEstado] = useState<EstadoOrden>('en_proceso')
  const [estadoPago, setEstadoPago] = useState<EstadoPago>('pendiente')
  const [valorAbono, setValorAbono] = useState('')
  const [motivoPendiente, setMotivoPendiente] = useState('')
  const [fechaProgramada, setFechaProgramada] = useState('')
  const [duracionEstimada, setDuracionEstimada] = useState('')
  const [telefono, setTelefono] = useState('')

  // null = oculto; 'finalizar' = ya está Pagada, preguntar si pasar a Finalizada;
  // 'marcar_pagado' = el pago ya está completo pero el estado no es Pagado/Finalizado
  const [finalizeDialogModo, setFinalizeDialogModo] = useState<'finalizar' | 'marcar_pagado' | null>(null)
  const [savingFinalize, setSavingFinalize] = useState(false)
  const [pendingNavBack, setPendingNavBack] = useState(false)
  const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null)

  // Refs para interceptar navegación sin crear listeners nuevos en cada render
  const ordenEstadoRef = useRef<string | undefined>(undefined)
  const umaSinNumeroRef = useRef(false)
  const pagoCompletoSinMarcarRef = useRef(false)
  const skipNextPopstate = useRef(false)

  // Pagos consecutivos
  const [pagosOrden, setPagosOrden] = useState<PagoOrden[]>([])
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState('')
  const [nuevoPagoMetodo, setNuevoPagoMetodo] = useState('')
  const [nuevoPagoNotas, setNuevoPagoNotas] = useState('')
  const [nuevoPagoSigno, setNuevoPagoSigno] = useState<'positivo' | 'negativo'>('positivo')
  const [savingPago, setSavingPago] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [tipoFactura, setTipoFactura] = useState<'normal' | 'general'>('normal')
  const [tenantNombre, setTenantNombre] = useState('Motospace')
  const [uploadingMedio, setUploadingMedio] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'leyendo' | 'subiendo' | 'comprimiendo'>('leyendo')
  const [pagoError, setPagoError] = useState('')
  // Lava moto
  const [lavaMotoConfig, setLavaMotoConfig] = useState<LavaMotoConfig | null>(null)
  const [lavaMotoOrdenes, setLavaMotoOrdenes] = useState<LavaMotoOrden[]>([])
  const [pagosProveedor, setPagosProveedor] = useState<PagoProveedor[]>([])
  const [nuevoPagoProvMonto, setNuevoPagoProvMonto] = useState('')
  const [nuevoPagoProvMetodo, setNuevoPagoProvMetodo] = useState('')
  const [nuevoPagoProvNotas, setNuevoPagoProvNotas] = useState('')
  const [savingPagosProv, setSavingPagosProv] = useState(false)
  const [pagoProvError, setPagoProvError] = useState('')
  const [comentariosOrden, setComentariosOrden] = useState<ComentarioOrden[]>([])
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [savingComentario, setSavingComentario] = useState(false)
  const fileInputMedioRef = useRef<HTMLInputElement>(null)
  const fileInputVideoRef = useRef<HTMLInputElement>(null)
  // Edición de fecha entrada/salida (solo gerencia) y eliminación de la entrada
  const [editandoFecha, setEditandoFecha] = useState<'entrada' | 'salida' | null>(null)
  const [fechaInputValue, setFechaInputValue] = useState('')
  const [savingFecha, setSavingFecha] = useState(false)
  const [deletingOrden, setDeletingOrden] = useState(false)
  // Edición de fecha de pagos e items (repuestos/mano de obra) — solo gerencia
  const [editandoPagoFechaId, setEditandoPagoFechaId] = useState<string | null>(null)
  const [pagoFechaInputValue, setPagoFechaInputValue] = useState('')
  const [savingPagoFecha, setSavingPagoFecha] = useState(false)
  const [editandoItemFechaId, setEditandoItemFechaId] = useState<string | null>(null)
  const [itemFechaInputValue, setItemFechaInputValue] = useState('')
  const [savingItemFecha, setSavingItemFecha] = useState(false)
  const [editandoLavadoFechaId, setEditandoLavadoFechaId] = useState<string | null>(null)
  const [lavadoFechaInputValue, setLavadoFechaInputValue] = useState('')
  const [savingLavadoFecha, setSavingLavadoFecha] = useState(false)
  const esGerencia = profile?.rol === 'gerencia'

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [{ data: o }, { data: i }, { data: m }, { data: mp }, { data: cats }, { data: pg }, { data: lmCfg }, { data: lmOrd }, { data: pprov }, { data: coments }] = await Promise.all([
      supabase.from('ordenes')
        .select(`id, numero, placa, cliente, telefono, estado, estado_pago, valor_total, valor_abono, motivo_pendiente, fecha_programada, duracion_estimada_horas, descripcion, manifiesta_cliente, diagnostico, tipo_orden, tipo_servicio, numero_ot, nota_ot, notas, numeros_orden_uma, categoria_servicio_id, subcategoria_servicio_id, subcategoria_servicio_ids, tenant_id, created_at, fecha_finalizacion, moto_id, cliente_id, gestiona_pago_proveedor,
          categorias_servicio(nombre), subcategorias_servicio(nombre), metodos_pago(id, nombre), usuarios:mecanico_id(nombre), motos:moto_id(id, marca, modelo, año, color, kilometraje)`)
        .eq('id', ordenId).single(),
      supabase.from('items_orden').select('id, descripcion, origen, cantidad, costo, precio_venta, estado_repuesto, metodo_pago_id, created_at').eq('orden_id', ordenId),
      supabase.from('medios').select('id, url, tipo, nombre_archivo, storage_location, drive_url, procesando').eq('orden_id', ordenId),
      supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', profile.tenant_id).eq('activo', true),
      supabase.from('categorias_servicio').select('id, nombre, subcategorias_servicio(id, nombre)').eq('tenant_id', profile.tenant_id).eq('activo', true).order('orden'),
      supabase.from('pagos_orden').select('id, monto, metodo_pago_id, fecha, notas, metodos_pago(nombre)').eq('orden_id', ordenId).order('fecha', { ascending: true }),
      supabase.from('lava_moto_config').select('id, costo, precio_venta, activo').eq('tenant_id', profile.tenant_id).maybeSingle(),
      supabase.from('lava_moto_ordenes').select('id, cantidad, costo_unitario, precio_venta_unitario, metodo_pago_id, pago_costo_id, created_at, metodos_pago(nombre)').eq('orden_id', ordenId).order('created_at'),
      supabase.from('pagos_proveedor').select('id, monto, notas, fecha, metodo_pago_id, metodos_pago(nombre)').eq('orden_id', ordenId).order('fecha', { ascending: true }),
      supabase.from('comentarios_orden').select('id, comentario, created_at, usuario_id, usuarios:usuario_id(nombre)').eq('orden_id', ordenId).order('created_at', { ascending: true }),
    ])
    if (o) {
      let ord = o as unknown as OrdenDetalle
      // Auto-confirmar: cuando un admin abre una orden en falta_revision la pasa a en_proceso
      if (ord.estado === 'falta_revision') {
        supabase.from('ordenes').update({ estado: 'en_proceso' }).eq('id', ordenId).then(() => {})
        registrarAuditoria(supabase, {
          tenant_id: ord.tenant_id,
          tabla: 'ordenes',
          registro_id: ordenId,
          tipo: 'edicion',
          valor_anterior: { estado: 'falta_revision' },
          valor_nuevo: { estado: 'en_proceso' },
          descripcion: `Confirmó automáticamente orden #${ord.numero} al abrirla → en_proceso`,
          usuario_id: profile?.id,
        }).catch(() => {})
        ord = { ...ord, estado: 'en_proceso' }
      }
      // Auto-pagado: solo desde en_proceso (no sobrescribir estados manuales como pendiente)
      if (ord.estado === 'en_proceso' && (ord.valor_total ?? 0) > 0 && pg) {
        const pgList = pg as unknown as PagoOrden[]
        const totalPagadoCargado = pgList.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
        const lmOrds = (lmOrd ?? []) as unknown as LavaMotoOrden[]
        const lmTotalCargado = lmOrds.reduce((s, r) => s + r.precio_venta_unitario * r.cantidad, 0)
        const valorConLMCargado = (ord.valor_total ?? 0) + lmTotalCargado
        if (totalPagadoCargado > 0 && totalPagadoCargado >= valorConLMCargado) {
          supabase.from('ordenes').update({ estado: 'pagado' }).eq('id', ordenId).then(() => {})
          registrarAuditoria(supabase, {
            tenant_id: ord.tenant_id,
            tabla: 'ordenes',
            registro_id: ordenId,
            tipo: 'edicion',
            valor_anterior: { estado: 'en_proceso' },
            valor_nuevo: { estado: 'pagado' },
            descripcion: `Marcó automáticamente como pagado orden #${ord.numero} (pago completo recibido)`,
            usuario_id: profile?.id,
          }).catch(() => {})
          ord = { ...ord, estado: 'pagado' }
        }
      }
      setOrden(ord)
      if (ord.cliente_id) {
        supabase.from('clientes').select('en_seguimiento_ventas').eq('id', ord.cliente_id).single()
          .then(({ data: c }) => { if (c) setClienteEnSeguimiento(!!(c as { en_seguimiento_ventas: boolean | null }).en_seguimiento_ventas) })
      }
      setEditCliente(ord.cliente)
      setEditPlaca(ord.placa ?? '')
      setEditDescripcion(ord.descripcion ?? '')
      setEditManifiestaCliente(ord.manifiesta_cliente ?? '')
      setEditDiagnostico(ord.diagnostico ?? '')
      setEditCategoriaId(ord.categoria_servicio_id ?? '')
      setEditSubcategoriaIds(
        ord.subcategoria_servicio_ids?.length
          ? ord.subcategoria_servicio_ids
          : ord.subcategoria_servicio_id ? [ord.subcategoria_servicio_id] : []
      )
      setEditTipoServicio((ord.tipo_servicio as 'terceros' | 'uma' | null) ?? '')

      setEstadoPago(ord.estado_pago)
      setValorAbono(String(ord.valor_abono ?? 0))

      setEstado(ord.estado)
      setMotivoPendiente(ord.motivo_pendiente ?? '')
      setFechaProgramada(ord.fecha_programada ? isoToDatetimeLocal(ord.fecha_programada) : '')
      setDuracionEstimada(ord.duracion_estimada_horas != null ? String(ord.duracion_estimada_horas) : '')
      setTelefono(soloDigitos(ord.telefono ?? ''))
      setNotas(ord.notas ?? '')
      setNumerosOrdenUMA(ord.numeros_orden_uma ?? [])
    }
    setItems((i as unknown as ItemOrden[]) ?? [])
    setMedios((m as unknown as Medio[]) ?? [])
    setMetodosPago((mp as unknown as { id: string; nombre: string }[]) ?? [])
    setCategorias((cats as unknown as Categoria[]) ?? [])
    setPagosOrden((pg as unknown as PagoOrden[]) ?? [])
    setLavaMotoConfig((lmCfg as LavaMotoConfig | null) ?? null)
    setLavaMotoOrdenes((lmOrd as unknown as LavaMotoOrden[]) ?? [])
    setPagosProveedor((pprov as unknown as PagoProveedor[]) ?? [])
    setComentariosOrden((coments as unknown as ComentarioOrden[]) ?? [])
  }, [ordenId, profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  // Mientras haya un video procesándose en segundo plano (conversión a mp4),
  // se refresca la lista de medios cada pocos segundos hasta que termine.
  useEffect(() => {
    if (!medios.some((m) => m.procesando)) return
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('medios')
        .select('id, url, tipo, nombre_archivo, storage_location, drive_url, procesando')
        .eq('orden_id', ordenId)
      if (data) setMedios(data as unknown as Medio[])
    }, 4000)
    return () => clearInterval(id)
  }, [medios, ordenId, supabase])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('nombre').eq('id', profile.tenant_id).single().then(({ data }) => {
      if (data) setTenantNombre((data as { nombre: string }).nombre)
    })
  }, [profile?.tenant_id])

  // Interceptar botón atrás del dispositivo/navegador dentro del SPA — si la orden
  // ya quedó pagada/completa pero el estado no lo refleja, se pregunta antes de salir.
  useEffect(() => {
    const onPopState = () => {
      if (skipNextPopstate.current) { skipNextPopstate.current = false; return }
      if (ordenEstadoRef.current === 'pagado' && !umaSinNumeroRef.current) {
        window.history.pushState(null, '', window.location.href)
        setPendingNavBack(true); setPendingNavUrl(null)
        setFinalizeDialogModo('finalizar')
      } else if (pagoCompletoSinMarcarRef.current) {
        window.history.pushState(null, '', window.location.href)
        setPendingNavBack(true); setPendingNavUrl(null)
        setFinalizeDialogModo('marcar_pagado')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Interceptar clics en enlaces internos cuando la orden está pagada/completa sin marcar
  useEffect(() => {
    const onLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//')) return
      if (href === window.location.pathname) return
      if (ordenEstadoRef.current === 'pagado' && !umaSinNumeroRef.current) {
        e.preventDefault(); e.stopPropagation()
        setPendingNavUrl(href); setPendingNavBack(false)
        setFinalizeDialogModo('finalizar')
      } else if (pagoCompletoSinMarcarRef.current) {
        e.preventDefault(); e.stopPropagation()
        setPendingNavUrl(href); setPendingNavBack(false)
        setFinalizeDialogModo('marcar_pagado')
      }
    }
    document.addEventListener('click', onLinkClick, true)
    return () => document.removeEventListener('click', onLinkClick, true)
  }, [])

  const cargarAudit = async () => {
    if (!orden) return
    setLoadingAudit(true)
    const itemIds = items.map((i) => i.id)
    const pagoIds = pagosOrden.map((p) => p.id)
    const [{ data: auditOrden }, auditItemsResult, auditPagosResult] = await Promise.all([
      supabase.from('auditoria')
        .select('id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)')
        .eq('registro_id', ordenId)
        .order('created_at', { ascending: false })
        .limit(40),
      itemIds.length > 0
        ? supabase.from('auditoria')
            .select('id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)')
            .in('registro_id', itemIds)
            .order('created_at', { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] }),
      pagoIds.length > 0
        ? supabase.from('auditoria')
            .select('id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)')
            .in('registro_id', pagoIds)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ])
    const all = [
      ...((auditOrden as unknown as AuditEntry[]) ?? []),
      ...((auditItemsResult.data as unknown as AuditEntry[]) ?? []),
      ...((auditPagosResult.data as unknown as AuditEntry[]) ?? []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    // Append synthetic creation entry at the end (oldest event)
    all.push({
      id: '__creation__',
      tipo: 'movimiento',
      descripcion: `Orden #${orden.numero} creada${orden.usuarios ? ` por ${(orden.usuarios as { nombre: string }).nombre}` : ''}`,
      valor_anterior: null,
      valor_nuevo: null,
      created_at: orden.created_at,
      usuarios: orden.usuarios as { nombre: string; email: string } | null,
    })
    setAuditLog(all)
    setLoadingAudit(false)
  }

  const handleConfirmar = async () => {
    setConfirmando(true)
    try {
      await supabase.from('ordenes').update({
        estado: 'en_proceso',
        telefono: telefono || null,
      }).eq('id', ordenId)
      await registrarAuditoria(supabase, {
        tenant_id: orden!.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenId,
        tipo: 'edicion',
        descripcion: `Confirmó orden #${orden?.numero} → en_proceso`,
        usuario_id: profile?.id,
      })
      await cargar()
    } finally {
      setConfirmando(false)
    }
  }

  const esGarantia = (() => {
    if (!orden) return false
    const allSubs = categorias.flatMap((c) => c.subcategorias_servicio)
    const ids = orden.subcategoria_servicio_ids?.length
      ? orden.subcategoria_servicio_ids
      : orden.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : []
    return ids.some((id) => allSubs.find((s) => s.id === id)?.nombre.toLowerCase().includes('garant'))
  })()

  const guardarCampoOrden = async (campo: 'cliente' | 'descripcion' | 'categoria' | 'placa') => {
    if (!orden) return
    if (campo === 'categoria' && orden.tipo_orden !== 'venta_repuestos' && !editTipoServicio) {
      alert('Selecciona el tipo de ingreso: UMA o Terceros.')
      return
    }
    setSavingOrden(true)
    const anterior: Record<string, unknown> = {}
    const update: Record<string, unknown> = {}
    if (campo === 'cliente') {
      anterior.cliente = orden.cliente
      update.cliente = editCliente.trim()
    }
    if (campo === 'placa') {
      anterior.placa = orden.placa
      update.placa = editPlaca.trim().toUpperCase() || null
    }
    if (campo === 'descripcion') {
      if (esGarantia) {
        anterior.manifiesta_cliente = orden.manifiesta_cliente
        anterior.diagnostico = orden.diagnostico
        update.manifiesta_cliente = editManifiestaCliente.trim() || null
        update.diagnostico = editDiagnostico.trim() || null
      } else {
        anterior.descripcion = orden.descripcion
        update.descripcion = editDescripcion.trim() || null
      }
    }
    if (campo === 'categoria') {
      anterior.categoria_servicio_id = orden.categoria_servicio_id
      anterior.subcategoria_servicio_id = orden.subcategoria_servicio_id
      update.categoria_servicio_id = editCategoriaId || null
      update.subcategoria_servicio_id = editSubcategoriaIds[0] || null
      update.subcategoria_servicio_ids = editSubcategoriaIds
      if (orden.tipo_orden !== 'venta_repuestos') {
        anterior.tipo_servicio = orden.tipo_servicio
        update.tipo_servicio = editTipoServicio
      }
    }
    await supabase.from('ordenes').update(update).eq('id', ordenId)
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'ordenes',
      registro_id: ordenId,
      tipo: 'edicion',
      valor_anterior: anterior,
      valor_nuevo: update,
      descripcion: `Admin editó ${campo} de orden #${orden.numero}`,
      usuario_id: profile?.id,
    })
    setEditingOrden(null)
    setSavingOrden(false)
    await cargar()
  }

  const recalcularValorTotal = async (): Promise<number> => {
    const [{ data: itemsDB }, { data: lavaMoto }] = await Promise.all([
      supabase.from('items_orden').select('precio_venta, cantidad').eq('orden_id', ordenId),
      supabase.from('lava_moto_ordenes').select('precio_venta_unitario, cantidad').eq('orden_id', ordenId),
    ])
    const total =
      (itemsDB ?? []).reduce((s, i) => s + (i.precio_venta ?? 0) * (i.cantidad ?? 0), 0) +
      (lavaMoto ?? []).reduce((s, l) => s + (l.precio_venta_unitario ?? 0) * (l.cantidad ?? 0), 0)
    await supabase.from('ordenes').update({ valor_total: total }).eq('id', ordenId)
    return total
  }

  const handleDeleteItem = async (item: ItemOrden) => {
    if (!confirm(`¿Eliminar "${item.descripcion}"?`)) return
    await supabase.from('items_orden').delete().eq('id', item.id)
    await recalcularValorTotal()
    // Devolver al inventario si era UMA
    await registrarDevolucion(supabase, {
      tenantId: orden!.tenant_id,
      repuesto_uma_id: item.repuesto_uma_id as string | undefined,
      cantidad: item.cantidad,
      costo_unitario: item.costo,
      precio_unitario: item.precio_venta,
      orden_id: ordenId,
      item_orden_id: item.id,
      registrado_por: profile?.id,
    })
    await registrarAuditoria(supabase, {
      tenant_id: orden!.tenant_id,
      tabla: 'items_orden',
      registro_id: item.id,
      tipo: 'eliminacion',
      valor_anterior: item as unknown as Record<string, unknown>,
      descripcion: `Eliminó ítem "${item.descripcion}" de orden #${orden?.numero}`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  const handleDeleteMedio = async (id: string) => {
    if (!confirm('¿Eliminar este archivo?')) return
    await fetch(`/api/media/${id}`, { method: 'DELETE' })
    setMedios((prev) => prev.filter((m) => m.id !== id))
  }

  const handleUploadMedio = async (e: React.ChangeEvent<HTMLInputElement>, tipoForzado?: 'imagen' | 'video') => {
    setUploadingMedio(true)
    setUploadError('')
    setUploadProgress(0)
    setUploadStage('leyendo')
    try {
      const file = e.target.files?.[0]
      if (!file) {
        setUploadError('No se pudo leer el archivo. Intenta seleccionarlo de nuevo.')
        return
      }
      if (!orden) return
      const videoExts = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.3gp', '.m4v', '.wmv', '.flv', '.ts'])
      // OPPO a veces entrega URIs como nombre; extraer extensión del type o usar mp4/jpg por defecto
      const rawName = file.name || ''
      const extFromName = rawName.includes('.') ? rawName.split('.').pop()?.toLowerCase() ?? '' : ''
      const extFromType = file.type.startsWith('video/') ? (file.type.split('/')[1]?.split(';')[0] ?? 'mp4')
        : file.type.startsWith('image/') ? (file.type.split('/')[1]?.split(';')[0] ?? 'jpg') : ''
      const ext = extFromName || extFromType
      const safeName = ext ? `archivo_${Date.now()}.${ext}` : `archivo_${Date.now()}`
      const filename = rawName && rawName.length < 200 && !rawName.startsWith('content://') ? rawName : safeName
      const esVideo = tipoForzado === 'video' ||
        (tipoForzado !== 'imagen' && (
          file.type.startsWith('video/') ||
          videoExts.has('.' + ext)
        ))
      const tipo: 'imagen' | 'video' = esVideo ? 'video' : 'imagen'

      // Obtener URL pre-firmada (el archivo nunca pasa por Vercel → sin límite de 4.5 MB)
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_id: ordenId, tipo, filename, filetype: file.type }),
      })
      if (!presignRes.ok) {
        const err = await presignRes.json()
        setUploadError(err.error ?? 'Error al preparar la subida')
        return
      }
      const presignData = await presignRes.json()

      // Si el tenant usa Google Drive para imágenes → subir vía FormData al endpoint de Drive
      if (presignData.mode === 'drive') {
        if (file.size === 0) throw new Error('El archivo parece vacío (0 bytes).')
        setUploadStage('subiendo')
        setUploadProgress(30)
        const fd = new FormData()
        fd.append('file', file)
        fd.append('orden_id', ordenId)
        fd.append('tipo', tipo)
        const driveRes = await fetch('/api/upload/drive', { method: 'POST', body: fd })
        setUploadProgress(100)
        if (driveRes.ok) {
          await cargar()
        } else {
          const err = await driveRes.json().catch(() => ({}))
          setUploadError(err.error ?? 'Error al subir la foto a Google Drive')
        }
        return
      }

      const { url, key, nombreArchivo, contentType } = presignData

      // Validar tamaño mínimo — OPPO a veces devuelve File vacío si el content:// no es accesible
      if (file.size === 0) {
        throw new Error('El archivo parece vacío (0 bytes). Puede que el video esté en la nube sin descargarse. Descárgalo primero e intenta de nuevo.')
      }

      // Leer con FileReader (más compatible en Android que arrayBuffer()).
      // arrayBuffer() cuelga silenciosamente en OPPO para videos grandes via content:// URI;
      // FileReader usa la API nativa de Android y dispara onerror en lugar de colgar.
      const fileBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        // 3 minutos máx para leer; si OPPO no puede acceder al archivo, expirará con mensaje claro
        const timer = setTimeout(() => {
          reader.abort()
          reject(new Error('El video tardó demasiado en leerse. Puede estar en la nube sin descargarse, o el dispositivo está ocupado. Intenta de nuevo.'))
        }, 180_000)
        reader.onprogress = (ev) => {
          // Mostrar progreso de lectura (0-40%) separado del de subida (40-100%)
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 40))
        }
        reader.onload = () => {
          clearTimeout(timer)
          resolve(reader.result as ArrayBuffer)
        }
        reader.onerror = () => {
          clearTimeout(timer)
          reject(new Error(`No se pudo leer el video: ${reader.error?.message ?? 'acceso denegado por el dispositivo'}. Intenta seleccionarlo de nuevo.`))
        }
        reader.readAsArrayBuffer(file)
      })

      // Subir directo a R2 con XHR + ArrayBuffer
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url, true)
        xhr.setRequestHeader('Content-Type', contentType)
        xhr.timeout = 600000 // 10 minutos
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(40 + Math.round((ev.loaded / ev.total) * 60))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            const r2Body = xhr.responseText?.slice(0, 300) ?? ''
            reject(new Error(`R2 rechazó la subida (HTTP ${xhr.status})${r2Body ? `: ${r2Body}` : ''}. Intenta de nuevo.`))
          }
        }
        xhr.onerror = () => reject(new Error('Error de red al conectar con R2. Verifica tu conexión e intenta de nuevo.'))
        xhr.ontimeout = () => reject(new Error('Tiempo agotado (10 min). Conexión muy lenta o archivo demasiado grande.'))
        xhr.send(fileBuffer)
      })

      // Registrar en Supabase (si es video sin extensión mp4, esto recodifica
      // a H.264/AAC en el servidor antes de responder — puede tardar un poco)
      if (tipo === 'video' && !key.toLowerCase().endsWith('.mp4')) setUploadStage('comprimiendo')
      const regRes = await fetch('/api/upload/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_id: ordenId, key, tipo, nombre_archivo: nombreArchivo, tamano_bytes: file.size }),
      })
      if (regRes.ok) {
        await cargar()
      } else {
        const err = await regRes.json()
        setUploadError(err.error ?? 'Error al registrar el archivo')
      }
    } catch (err) {
      setUploadError((err as Error).message ?? 'Error inesperado al subir. Intenta de nuevo.')
    } finally {
      setUploadingMedio(false)
      setUploadProgress(0)
      if (fileInputMedioRef.current) fileInputMedioRef.current.value = ''
      if (fileInputVideoRef.current) fileInputVideoRef.current.value = ''
    }
  }

  const handleAddItem = async (item: {
    descripcion: string; origen: 'uma' | 'externo' | 'insumo'; repuesto_uma_id?: string;
    repuesto_externo_id?: string; cantidad: number; costo: number; precio_venta: number;
    metodo_pago_id?: string | null;
  }) => {
    const { data, error } = await supabase.from('items_orden').insert({
      orden_id: ordenId,
      ...item,
    }).select('*').single()
    if (error) {
      alert(`No se pudo guardar "${item.descripcion}": ${error.message}`)
      return
    }
    if (data) {
      const itemId = (data as { id: string }).id
      await Promise.all([
        recalcularValorTotal(),
        registrarSalida(
          supabase,
          orden!.tipo_orden === 'venta_repuestos' ? 'venta_directa' : 'uso_st',
          {
            tenantId: orden!.tenant_id,
            repuesto_uma_id: item.repuesto_uma_id ?? null,
            repuesto_externo_id: item.repuesto_externo_id ?? null,
            cantidad: item.cantidad,
            costo_unitario: item.costo,
            precio_unitario: item.precio_venta,
            orden_id: ordenId,
            item_orden_id: itemId,
            registrado_por: profile?.id,
          }
        ),
        registrarAuditoria(supabase, {
          tenant_id: orden!.tenant_id,
          tabla: 'items_orden',
          registro_id: itemId,
          tipo: 'movimiento',
          descripcion: `Agregó repuesto "${item.descripcion}" (×${item.cantidad}) → $${(item.precio_venta * item.cantidad).toLocaleString('es-CO')} | orden #${orden?.numero}`,
          usuario_id: profile?.id,
        }),
      ])
      await cargar()
    }
  }

  // Actualiza un ítem de repuesto ya guardado (UMA/Externo/Insumo/Porta) y recalcula
  // el valor_total de la orden con el cambio ya aplicado. Retorna true si guardó OK.
  const actualizarItemRepuesto = async (id: string, cambios: Partial<{ descripcion: string; precio_venta: number; cantidad: number; costo: number; metodo_pago_id: string | null }>): Promise<boolean> => {
    const itemAnterior = items.find((i) => i.id === id)
    const { data: updated, error } = await supabase
      .from('items_orden').update(cambios).eq('id', id).select('id')
    if (error) {
      setEditingItem(prev => prev ? { ...prev, errMsg: `No se pudo guardar: ${error.message}` } : prev)
      return false
    }
    if (!updated || updated.length === 0) {
      setEditingItem(prev => prev ? { ...prev, errMsg: 'Sin permisos para modificar este ítem. Contacta al administrador.' } : prev)
      return false
    }
    await recalcularValorTotal()
    await registrarAuditoria(supabase, {
      tenant_id: orden!.tenant_id,
      tabla: 'items_orden',
      registro_id: id,
      tipo: 'edicion',
      valor_anterior: itemAnterior ? { descripcion: itemAnterior.descripcion, precio_venta: itemAnterior.precio_venta, costo: itemAnterior.costo, metodo_pago_id: itemAnterior.metodo_pago_id } : undefined,
      valor_nuevo: cambios,
      descripcion: `Editó repuesto "${cambios.descripcion ?? itemAnterior?.descripcion}" | orden #${orden?.numero}`,
      usuario_id: profile?.id,
    })
    return true
  }

  // Guarda los cambios de la fila en edición (repuesto o mano de obra).
  const handleEditItem = async () => {
    if (!editingItem || !editingItem.descripcion.trim()) return
    const itemActual = items.find((i) => i.id === editingItem.id)
    const precio = parseInt(editingItem.precio.replace(/\D/g, ''), 10) || 0
    const cantidad = Math.max(1, parseInt(editingItem.cantidad || '1', 10) || 1)
    const costo = itemActual?.origen === 'externo' ? (parseInt(editingItem.costo.replace(/\D/g, ''), 10) || 0) : 0
    const descripcionFinal = editingItem.codigoPrefix
      ? `${editingItem.codigoPrefix} - ${editingItem.descripcion.trim()}`
      : editingItem.descripcion.trim()

    // Validar precio mínimo para ítems UMA
    if (itemActual?.origen === 'uma' && editingItem.precioMin !== null && precio < (editingItem.precioMin ?? 0)) {
      setEditingItem(prev => prev ? { ...prev, errMsg: `Mínimo: ${formatCOP(editingItem.precioMin!)}` } : prev)
      return
    }

    const ok = await actualizarItemRepuesto(editingItem.id, {
      descripcion: descripcionFinal,
      precio_venta: precio,
      cantidad,
      costo,
      metodo_pago_id: itemActual?.origen === 'externo' ? (editingItem.metodo_pago_id || null) : null,
    })
    if (!ok) return

    // Ajustar stock si la cantidad cambió en un ítem UMA con repuesto_uma_id
    if (itemActual?.repuesto_uma_id && cantidad !== itemActual.cantidad) {
      const delta = cantidad - itemActual.cantidad  // positivo = usó más, negativo = devolvió
      await supabase.from('movimientos_inventario').update({ cantidad }).eq('item_orden_id', editingItem.id)
      await supabase.rpc('ajustar_stock_uma', { p_repuesto_id: itemActual.repuesto_uma_id, p_delta: -delta })
    }

    setEditingItem(null)
    await cargar()
  }

  const iniciarEditarItem = async (item: ItemOrden) => {
    const sepIdx = item.descripcion.indexOf(' - ')
    const codigoPrefix = item.origen === 'uma' && sepIdx > 0 ? item.descripcion.slice(0, sepIdx) : ''
    const descripcion = item.origen === 'uma' && sepIdx > 0 ? item.descripcion.slice(sepIdx + 3) : item.descripcion
    setEditingItem({
      id: item.id, descripcion, codigoPrefix,
      costo: String(item.costo), precio: String(item.precio_venta),
      metodo_pago_id: item.metodo_pago_id ?? '',
      precioMin: null, errMsg: '',
      cantidad: String(item.cantidad),
    })
    // Para ítems UMA del catálogo, cargar precio mínimo
    if (item.origen === 'uma' && item.repuesto_uma_id) {
      const { data } = await supabase.from('repuestos_uma')
        .select('precio_publico_iva').eq('id', item.repuesto_uma_id).single()
      if (data) {
        setEditingItem(prev => prev?.id === item.id
          ? { ...prev, precioMin: (data as { precio_publico_iva: number }).precio_publico_iva ?? null }
          : prev
        )
      }
    }
  }

  const lavadoDefaults = () => ({
    cantidad: '1',
    costo: String(lavaMotoConfig?.costo ?? 10000),
    valor: String(lavaMotoConfig?.precio_venta ?? 15000),
    metodo: '',
    editId: null as string | null,
  })

  // Lavado de moto: se agrega con el botón "+ Agregar lavado" (en la tarjeta de Pagos) y
  // queda en una lista — envío explícito, igual a Mano de obra y Repuestos.
  const confirmarAgregarLavado = async () => {
    if (!lavadoFormListo || guardandoLavado) return
    setGuardandoLavado(true)
    try {
      const cantidadLav = parseInt(lavadoQuick.cantidad || '0', 10) || 1
      const costoLav = parseInt(lavadoQuick.costo.replace(/\D/g, '') || '0', 10)
      const precioLav = parseInt(lavadoQuick.valor.replace(/\D/g, ''), 10) || 0
      const { data: lmData, error: lmError } = await supabase.from('lava_moto_ordenes').insert({
        orden_id: ordenId,
        tenant_id: orden!.tenant_id,
        cantidad: cantidadLav,
        costo_unitario: costoLav,
        precio_venta_unitario: precioLav,
        metodo_pago_id: lavadoQuick.metodo || null,
        pago_costo_id: null,
        registrado_por: profile?.id ?? null,
      }).select('id').single()
      if (lmError) {
        alert(`No se pudo guardar el lavado: ${lmError.message}`)
        return
      }
      if (lmData) {
        await recalcularValorTotal()
        await registrarAuditoria(supabase, {
          tenant_id: orden!.tenant_id,
          tabla: 'lava_moto_ordenes',
          registro_id: (lmData as { id: string }).id,
          tipo: 'movimiento',
          valor_nuevo: { cantidad: cantidadLav, precio_venta_unitario: precioLav },
          descripcion: `Agregó servicio de lavado ×${cantidadLav} ($${precioLav.toLocaleString('es-CO')} c/u) | orden #${orden?.numero}`,
          usuario_id: profile?.id,
        })
      }
      setLavadoQuick(lavadoDefaults())
      setMostrarLavado(false)
      await cargar()
    } finally {
      setGuardandoLavado(false)
    }
  }

  const confirmarEditarLavado = async () => {
    if (!lavadoFormListo || guardandoLavado || !lavadoQuick.editId) return
    setGuardandoLavado(true)
    try {
      const id = lavadoQuick.editId
      const cantidadLav = parseInt(lavadoQuick.cantidad || '0', 10) || 1
      const costoLav = parseInt(lavadoQuick.costo.replace(/\D/g, '') || '0', 10)
      const precioLav = parseInt(lavadoQuick.valor.replace(/\D/g, ''), 10) || 0
      const lmAnterior = lavaMotoOrdenes.find((r) => r.id === id)
      await supabase.from('lava_moto_ordenes').update({
        cantidad: cantidadLav, costo_unitario: costoLav, precio_venta_unitario: precioLav, metodo_pago_id: lavadoQuick.metodo || null,
      }).eq('id', id)
      await recalcularValorTotal()
      await registrarAuditoria(supabase, {
        tenant_id: orden!.tenant_id,
        tabla: 'lava_moto_ordenes',
        registro_id: id,
        tipo: 'edicion',
        valor_anterior: { cantidad: lmAnterior?.cantidad, costo_unitario: lmAnterior?.costo_unitario, precio_venta_unitario: lmAnterior?.precio_venta_unitario },
        valor_nuevo: { cantidad: cantidadLav, costo_unitario: costoLav, precio_venta_unitario: precioLav },
        descripcion: `Editó servicio de lavado | orden #${orden?.numero}`,
        usuario_id: profile?.id,
      })
      setLavadoQuick(lavadoDefaults())
      setMostrarLavado(false)
      await cargar()
    } finally {
      setGuardandoLavado(false)
    }
  }

  // Mano de obra: se agrega con el botón "+ Agregar mano de obra" y queda en una lista.
  const confirmarAgregarMo = async () => {
    if (!moListo || guardandoMo) return
    setGuardandoMo(true)
    try {
      const desc = moDescripcion.trim()
      const precio = parseInt(moValor.replace(/\D/g, ''), 10)
      const { data, error } = await supabase.from('items_orden').insert({
        orden_id: ordenId,
        descripcion: desc,
        origen: 'mano_obra',
        cantidad: 1,
        costo: 0,
        precio_venta: precio,
      }).select('id').single()
      if (error) {
        alert(`No se pudo guardar la mano de obra "${desc}": ${error.message}`)
        return
      }
      if (data) {
        await recalcularValorTotal()
        await registrarAuditoria(supabase, {
          tenant_id: orden!.tenant_id,
          tabla: 'items_orden',
          registro_id: (data as { id: string }).id,
          tipo: 'movimiento',
          descripcion: `Agregó mano de obra "${desc}" → $${precio.toLocaleString('es-CO')} | orden #${orden?.numero}`,
          usuario_id: profile?.id,
        })
      }
      setMoDescripcion('')
      setMoValor('')
      setMostrarFormMo(false)
      await cargar()
    } finally {
      setGuardandoMo(false)
    }
  }

  const iniciarEditarLavado = (lm: LavaMotoOrden) => { setLavadoQuick({ cantidad: String(lm.cantidad), costo: String(lm.costo_unitario), valor: String(lm.precio_venta_unitario), metodo: lm.metodo_pago_id ?? '', editId: lm.id }); setMostrarLavado(true) }
  const cancelarEditarLavado = () => { setLavadoQuick(lavadoDefaults()); setMostrarLavado(false) }
  const toggleAgregarLavado = () => {
    if (mostrarLavado) { setMostrarLavado(false); return }
    setLavadoQuick(lavadoDefaults())
    setMostrarLavado(true)
  }

  // Formulario de Cantidad/Método/Precio proveedor/Precio venta para agregar o editar un
  // lavado — reusado tanto en el botón "+ Agregar lavado" como en "Editar".
  const formularioLavado = (onSubmit: () => void, submitLabel: string, onCancel: () => void) => (
    <div className="p-2.5 rounded-lg border border-cyan-200 bg-cyan-50/40 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Cantidad</label>
          <input
            type="text" inputMode="numeric"
            value={lavadoQuick.cantidad}
            onChange={(e) => setLavadoQuick((q) => ({ ...q, cantidad: e.target.value.replace(/\D/g, '') }))}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Método pago prov.</label>
          <select
            value={lavadoQuick.metodo}
            onChange={(e) => setLavadoQuick((q) => ({ ...q, metodo: e.target.value }))}
            className="w-full px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
          >
            <option value="">—</option>
            {metodosPago.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Precio proveedor</label>
          <input
            type="text" inputMode="numeric"
            value={lavadoQuick.costo ? '$' + parseInt(lavadoQuick.costo || '0', 10).toLocaleString('es-CO') : ''}
            onChange={(e) => setLavadoQuick((q) => ({ ...q, costo: e.target.value.replace(/\D/g, '') }))}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 mb-0.5 block">Precio venta</label>
          <input
            type="text" inputMode="numeric"
            value={lavadoQuick.valor ? '$' + parseInt(lavadoQuick.valor || '0', 10).toLocaleString('es-CO') : ''}
            onChange={(e) => setLavadoQuick((q) => ({ ...q, valor: e.target.value.replace(/\D/g, '') }))}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={!lavadoFormListo || guardandoLavado}
          className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-lg text-xs font-semibold"
        >
          {guardandoLavado ? 'Guardando...' : submitLabel}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
      </div>
    </div>
  )

  // Celda de fecha genérica (solo gerencia puede editarla) — reusada en repuestos, mano de obra y lavado.
  const celdaFechaGenerica = (
    fecha: string,
    editing: boolean,
    inputValue: string,
    setInputValue: (v: string) => void,
    onGuardar: () => void,
    onCancelar: () => void,
    onAbrir: () => void,
    saving: boolean,
  ) => {
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="datetime-local"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 w-[148px]"
            autoFocus
          />
          <button onClick={onGuardar} disabled={saving} className="text-green-600 hover:text-green-800 p-0.5" title="Guardar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
          <button onClick={onCancelar} disabled={saving} className="text-gray-400 hover:text-red-500 p-0.5" title="Cancelar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )
    }
    return (
      <span className="flex items-center gap-0.5 whitespace-nowrap text-[10px] text-gray-400 leading-none">
        {new Date(fecha).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        {esGerencia && (
          <button onClick={onAbrir} className="text-gray-300 hover:text-purple-600 p-0.5" title="Editar fecha (gerencia)">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </span>
    )
  }

  const celdaFecha = (item: ItemOrden) => celdaFechaGenerica(
    item.created_at,
    editandoItemFechaId === item.id,
    itemFechaInputValue,
    setItemFechaInputValue,
    handleGuardarFechaItem,
    () => setEditandoItemFechaId(null),
    () => abrirEditarFechaItem(item),
    savingItemFecha,
  )

  const celdaFechaLavado = (lm: LavaMotoOrden) => celdaFechaGenerica(
    lm.created_at,
    editandoLavadoFechaId === lm.id,
    lavadoFechaInputValue,
    setLavadoFechaInputValue,
    handleGuardarFechaLavado,
    () => setEditandoLavadoFechaId(null),
    () => abrirEditarFechaLavado(lm),
    savingLavadoFecha,
  )

  // Fecha (si se pasa) + acciones editar/eliminar, agrupadas en una sola columna para que
  // siempre queden visibles juntas, sin depender de hover ni de que la tabla no haga scroll.
  const accionesRepuesto = (onEditar: () => void, onEliminar: () => void, fechaNode?: React.ReactNode) => {
    return (
      <div className="flex flex-col items-end gap-0.5">
        {fechaNode && <div className="flex-shrink-0">{fechaNode}</div>}
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={onEditar} className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded p-1.5" title="Editar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onEliminar} className="text-gray-500 hover:text-red-600 hover:bg-red-50 rounded p-1.5" title="Eliminar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Solo cuenta pagos positivos del cliente; los negativos son egresos (costos lava moto)
  const calcularEstadoPago = (pagos: PagoOrden[], valorTotal: number): EstadoPago => {
    const totalCliente = pagos.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
    if (totalCliente <= 0) return 'pendiente'
    if (totalCliente >= valorTotal) return 'pagado'
    return 'abono'
  }

  const handleAddPago = async () => {
    const montoBase = parseInt(nuevoPagoMonto.replace(/\D/g, ''), 10)
    if (!montoBase || !orden) return
    if (!nuevoPagoMetodo) { setPagoError('Selecciona un método de pago.'); return }
    const monto = nuevoPagoSigno === 'negativo' ? -montoBase : montoBase
    setSavingPago(true)
    setPagoError('')
    try {
      const { data: pagoData, error: pagoInsertError } = await supabase.from('pagos_orden').insert({
        orden_id: ordenId,
        tenant_id: orden.tenant_id,
        monto,
        metodo_pago_id: nuevoPagoMetodo,
        notas: nuevoPagoNotas.trim() || null,
        registrado_por: profile?.id ?? null,
      }).select('id').single()
      if (pagoInsertError) {
        setPagoError(`Error: ${pagoInsertError.message}`)
        return
      }
      // Recalcular estado_pago y valor_abono (solo pagos positivos del cliente)
      const nuevosPagos = [...pagosOrden, { id: '', monto, metodo_pago_id: nuevoPagoMetodo || null, fecha: new Date().toISOString(), notas: nuevoPagoNotas || null, metodos_pago: null }]
      const lmTotalPago = lavaMotoOrdenes.reduce((s, r) => s + r.precio_venta_unitario * r.cantidad, 0)
      const totalItemsPago = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      const nuevoTotalPago = totalItemsPago + lmTotalPago
      const nuevoEstadoPago = calcularEstadoPago(nuevosPagos, nuevoTotalPago)
      const totalPagado = nuevosPagos.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
      const ahora = new Date().toISOString()
      const autoEstadoOrden = nuevoEstadoPago === 'pagado' && !['listo', 'pagado'].includes(orden.estado)
        ? 'pagado' : null
      const { error: ordUpdError } = await supabase.from('ordenes').update({
        estado_pago: nuevoEstadoPago,
        valor_abono: totalPagado,
        valor_total: nuevoTotalPago,
        metodo_pago_id: nuevoPagoMetodo || null,
        ...(autoEstadoOrden ? { estado: autoEstadoOrden } : {}),
      }).eq('id', ordenId)
      if (ordUpdError) {
        setPagoError(`Pago registrado, pero falló al actualizar la orden: ${ordUpdError.message}`)
      }
      if (pagoData) {
        await registrarAuditoria(supabase, {
          tenant_id: orden.tenant_id,
          tabla: 'pagos_orden',
          registro_id: (pagoData as { id: string }).id,
          tipo: 'movimiento',
          descripcion: `${monto < 0 ? 'Registró descuento/egreso' : 'Registró pago'} ${formatCOP(Math.abs(monto))} | orden #${orden.numero}`,
          usuario_id: profile?.id,
        })
      }
      setNuevoPagoMonto('')
      setNuevoPagoMetodo('')
      setNuevoPagoNotas('')
      setNuevoPagoSigno('positivo')
      if (autoEstadoOrden && !ordUpdError) {
        // Reflejar el estado pagado de inmediato mientras se recarga desde la BD
        setEstado('pagado' as EstadoOrden)
      }
      await cargar()
    } finally {
      setSavingPago(false)
    }
  }

  const handleDeletePago = async (pagoId: string) => {
    if (!confirm('¿Eliminar este pago?') || !orden) return
    const pagoEliminado = pagosOrden.find((p) => p.id === pagoId)
    await supabase.from('pagos_orden').delete().eq('id', pagoId)
    const pagosRestantes = pagosOrden.filter((p) => p.id !== pagoId)
    const lmTotal = lavaMotoOrdenes.reduce((s, r) => s + r.precio_venta_unitario * r.cantidad, 0)
    const totalConLM = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0) + lmTotal
    const nuevoEstadoPago = calcularEstadoPago(pagosRestantes, totalConLM)
    const totalPagado = pagosRestantes.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
    await supabase.from('ordenes').update({
      estado_pago: nuevoEstadoPago,
      valor_abono: totalPagado,
      valor_total: totalConLM,
    }).eq('id', ordenId)
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'pagos_orden',
      registro_id: pagoId,
      tipo: 'eliminacion',
      valor_anterior: pagoEliminado ? { monto: pagoEliminado.monto, metodo_pago_id: pagoEliminado.metodo_pago_id } : undefined,
      descripcion: `Eliminó pago de $${(pagoEliminado?.monto ?? 0).toLocaleString('es-CO')} | orden #${orden.numero}`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  const handleAddPagoProveedor = async () => {
    const monto = parseInt(nuevoPagoProvMonto.replace(/\D/g, ''), 10)
    if (!monto || !orden) return
    if (!nuevoPagoProvMetodo) { setPagoProvError('Selecciona un método de pago.'); return }
    setSavingPagosProv(true)
    setPagoProvError('')
    try {
      const { error } = await supabase.from('pagos_proveedor').insert({
        orden_id: ordenId,
        tenant_id: orden.tenant_id,
        monto,
        notas: nuevoPagoProvNotas.trim() || null,
        metodo_pago_id: nuevoPagoProvMetodo || null,
        registrado_por: profile?.id ?? null,
      })
      if (error) { setPagoProvError(error.message); return }
      setNuevoPagoProvMonto('')
      setNuevoPagoProvMetodo('')
      setNuevoPagoProvNotas('')
      await cargar()
    } finally {
      setSavingPagosProv(false)
    }
  }

  const handleAddComentario = async () => {
    if (!nuevoComentario.trim() || !orden) return
    setSavingComentario(true)
    try {
      await supabase.from('comentarios_orden').insert({
        orden_id: ordenId,
        tenant_id: orden.tenant_id,
        comentario: nuevoComentario.trim(),
        usuario_id: profile?.id ?? null,
      })
      setNuevoComentario('')
      await cargar()
    } finally {
      setSavingComentario(false)
    }
  }

  const handleDeleteComentario = async (id: string) => {
    if (!confirm('¿Eliminar este comentario?')) return
    await supabase.from('comentarios_orden').delete().eq('id', id)
    await cargar()
  }

  const handleDeletePagoProveedor = async (id: string) => {
    if (!confirm('¿Eliminar este pago a proveedor?')) return
    await supabase.from('pagos_proveedor').delete().eq('id', id)
    await cargar()
  }

  // ── Edición de fecha de un pago (exclusivo gerencia) ─────────────────────────
  const abrirEditarFechaPago = (pago: PagoOrden) => {
    setPagoFechaInputValue(isoToDatetimeLocal(pago.fecha))
    setEditandoPagoFechaId(pago.id)
  }

  const handleGuardarFechaPago = async () => {
    if (!orden || !editandoPagoFechaId || !pagoFechaInputValue) return
    setSavingPagoFecha(true)
    try {
      const pago = pagosOrden.find((p) => p.id === editandoPagoFechaId)
      const nuevaFechaISO = new Date(pagoFechaInputValue).toISOString()
      await supabase.from('pagos_orden').update({ fecha: nuevaFechaISO }).eq('id', editandoPagoFechaId)
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'pagos_orden',
        registro_id: editandoPagoFechaId,
        tipo: 'edicion',
        valor_anterior: { fecha: pago?.fecha },
        valor_nuevo: { fecha: nuevaFechaISO },
        descripcion: `Gerencia editó la fecha de un pago | orden #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoPagoFechaId(null)
      await cargar()
    } finally {
      setSavingPagoFecha(false)
    }
  }

  // ── Edición de fecha de un item (repuesto/mano de obra, exclusivo gerencia) ──
  const abrirEditarFechaItem = (item: ItemOrden) => {
    setItemFechaInputValue(isoToDatetimeLocal(item.created_at))
    setEditandoItemFechaId(item.id)
  }

  const handleGuardarFechaItem = async () => {
    if (!orden || !editandoItemFechaId || !itemFechaInputValue) return
    setSavingItemFecha(true)
    try {
      const item = items.find((i) => i.id === editandoItemFechaId)
      const nuevaFechaISO = new Date(itemFechaInputValue).toISOString()
      await supabase.from('items_orden').update({ created_at: nuevaFechaISO }).eq('id', editandoItemFechaId)
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'items_orden',
        registro_id: editandoItemFechaId,
        tipo: 'edicion',
        valor_anterior: { created_at: item?.created_at },
        valor_nuevo: { created_at: nuevaFechaISO },
        descripcion: `Gerencia editó la fecha de "${item?.descripcion ?? 'un ítem'}" | orden #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoItemFechaId(null)
      await cargar()
    } finally {
      setSavingItemFecha(false)
    }
  }

  // ── Edición de fecha de un lavado de moto (exclusivo gerencia) ──
  const abrirEditarFechaLavado = (lm: LavaMotoOrden) => {
    setLavadoFechaInputValue(isoToDatetimeLocal(lm.created_at))
    setEditandoLavadoFechaId(lm.id)
  }

  const handleGuardarFechaLavado = async () => {
    if (!orden || !editandoLavadoFechaId || !lavadoFechaInputValue) return
    setSavingLavadoFecha(true)
    try {
      const lm = lavaMotoOrdenes.find((r) => r.id === editandoLavadoFechaId)
      const nuevaFechaISO = new Date(lavadoFechaInputValue).toISOString()
      await supabase.from('lava_moto_ordenes').update({ created_at: nuevaFechaISO }).eq('id', editandoLavadoFechaId)
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'lava_moto_ordenes',
        registro_id: editandoLavadoFechaId,
        tipo: 'edicion',
        valor_anterior: { created_at: lm?.created_at },
        valor_nuevo: { created_at: nuevaFechaISO },
        descripcion: `Gerencia editó la fecha del lavado de moto | orden #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoLavadoFechaId(null)
      await cargar()
    } finally {
      setSavingLavadoFecha(false)
    }
  }

  const handleDeleteLavaMoto = async (id: string) => {
    if (!confirm('¿Eliminar este servicio de lavado?') || !orden) return
    const lmEliminado = lavaMotoOrdenes.find((r) => r.id === id)
    await supabase.from('lava_moto_ordenes').delete().eq('id', id)
    const nuevoTotal = await recalcularValorTotal()
    const totalCliente = pagosOrden.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
    const nuevoEstado = calcularEstadoPago(pagosOrden, nuevoTotal)
    await supabase.from('ordenes').update({ estado_pago: nuevoEstado, valor_abono: totalCliente }).eq('id', ordenId)
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'lava_moto_ordenes',
      registro_id: id,
      tipo: 'eliminacion',
      valor_anterior: lmEliminado ? { cantidad: lmEliminado.cantidad, precio_venta_unitario: lmEliminado.precio_venta_unitario } : undefined,
      descripcion: `Eliminó servicio de lavado | orden #${orden.numero}`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  // ── Edición de fecha/hora de entrada y salida (exclusivo gerencia) ──────────
  const abrirEditarFecha = (tipo: 'entrada' | 'salida') => {
    if (!orden) return
    const actual = tipo === 'entrada' ? orden.created_at : orden.fecha_finalizacion
    setFechaInputValue(actual ? isoToDatetimeLocal(actual) : isoToDatetimeLocal(new Date().toISOString()))
    setEditandoFecha(tipo)
  }

  const handleGuardarFecha = async () => {
    if (!orden || !editandoFecha || !fechaInputValue) return
    setSavingFecha(true)
    try {
      const nuevaFechaISO = new Date(fechaInputValue).toISOString()
      const campo = editandoFecha === 'entrada' ? 'created_at' : 'fecha_finalizacion'
      const valorAnterior = editandoFecha === 'entrada' ? orden.created_at : orden.fecha_finalizacion
      await supabase.from('ordenes').update({ [campo]: nuevaFechaISO }).eq('id', ordenId)
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenId,
        tipo: 'edicion',
        valor_anterior: { [campo]: valorAnterior },
        valor_nuevo: { [campo]: nuevaFechaISO },
        descripcion: `Gerencia editó la fecha de ${editandoFecha} de la orden #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoFecha(null)
      await cargar()
    } finally {
      setSavingFecha(false)
    }
  }

  // ── Eliminar la entrada completa (exclusivo gerencia) ────────────────────────
  const handleDeleteOrden = async () => {
    if (!orden) return
    if (!confirm(`¿Eliminar la entrada #${orden.numero} de ${orden.cliente}? Esto borrará también sus repuestos, pagos, fotos/videos y servicios de lavado asociados. Esta acción no se puede deshacer.`)) return
    setDeletingOrden(true)
    try {
      // Devolver al inventario los repuestos UMA usados, igual que al borrar un ítem individual
      for (const item of items) {
        if (item.origen === 'mano_obra' || !item.repuesto_uma_id) continue
        await registrarDevolucion(supabase, {
          tenantId: orden.tenant_id,
          repuesto_uma_id: item.repuesto_uma_id as string | undefined,
          cantidad: item.cantidad,
          costo_unitario: item.costo,
          precio_unitario: item.precio_venta,
          orden_id: ordenId,
          item_orden_id: item.id,
          registrado_por: profile?.id,
        })
      }
      // Borrar archivos de R2/Drive y filas de medios
      for (const medio of medios) {
        await fetch(`/api/media/${medio.id}`, { method: 'DELETE' }).catch(() => {})
      }
      // Lava moto no tiene cascada confirmada — borrar explícitamente
      await supabase.from('lava_moto_ordenes').delete().eq('orden_id', ordenId)
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenId,
        tipo: 'eliminacion',
        valor_anterior: orden as unknown as Record<string, unknown>,
        descripcion: `Gerencia eliminó la entrada #${orden.numero} de ${orden.cliente} (placa ${orden.placa})`,
        usuario_id: profile?.id,
      })
      // Cascada en DB se encarga de items_orden y pagos_orden
      await supabase.from('ordenes').delete().eq('id', ordenId)
      router.push('/admin/ordenes')
    } finally {
      setDeletingOrden(false)
    }
  }

  // Guarda de inmediato un cambio parcial de la orden (estado, teléfono, notas, etc.)
  // — reemplaza al antiguo botón "Guardar cambios": cada campo se persiste solo.
  const guardarCampoSidebar = async (cambios: Record<string, unknown>, descripcion: string) => {
    if (!orden) return
    const { error: updError } = await supabase.from('ordenes').update(cambios).eq('id', ordenId)
    if (updError) {
      alert(`No se pudo guardar: ${updError.message}`)
      return
    }
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'ordenes',
      registro_id: ordenId,
      tipo: 'edicion',
      valor_nuevo: cambios,
      descripcion,
      usuario_id: profile?.id,
    })
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 1500)
    await cargar()
  }

  const cambiarEstado = async (nuevoEstado: EstadoOrden) => {
    if (!orden) return
    const esFinalizacion = nuevoEstado === 'listo' && orden.estado !== 'listo'
    setEstado(nuevoEstado)
    await guardarCampoSidebar(
      { estado: nuevoEstado, ...(esFinalizacion ? { fecha_finalizacion: new Date().toISOString() } : {}) },
      `Cambió el estado de la orden #${orden.numero} a "${nuevoEstado}"`,
    )
  }

  const actualizarNumerosUMA = (updater: (prev: string[]) => string[]) => {
    setNumerosOrdenUMA((prev) => {
      const next = updater(prev)
      if (orden) {
        guardarCampoSidebar(
          { numeros_orden_uma: next },
          `Actualizó los # de Orden UMA de la orden #${orden.numero}`,
        )
      }
      return next
    })
  }

  // Mantener refs sincronizados con el estado actual (se ejecuta en cada render)
  ordenEstadoRef.current = orden?.estado

  if (!orden) return <div className="p-8 text-center text-gray-500">Cargando...</div>

  // Repuestos, mano de obra y lavado se guardan de inmediato al agregarlos (botón +
  // modal/form), así que estos arreglos siempre reflejan lo último guardado.
  const repuestosItems = items.filter((i) => i.origen !== 'mano_obra')
  const manoObraItems = items.filter((i) => i.origen === 'mano_obra')
  const totalRepuestos = repuestosItems.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalManoObra = manoObraItems.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalCostoProveedor = repuestosItems.filter((i) => i.origen === 'externo').reduce((s, i) => s + i.costo * i.cantidad, 0)
  const totalLavado = lavaMotoOrdenes.reduce((s, r) => s + r.precio_venta_unitario * r.cantidad, 0)
  const totalCostoLavado = lavaMotoOrdenes.reduce((s, r) => s + r.costo_unitario * r.cantidad, 0)
  const totalCostoProveedorLive = totalCostoProveedor + totalCostoLavado
  const gestionaProveedor = orden?.gestiona_pago_proveedor ?? false
  const totalPagadoProveedor = pagosProveedor.reduce((s, p) => s + p.monto, 0)
  const proveedorPagadoCompleto = !gestionaProveedor || totalCostoProveedorLive === 0 || totalPagadoProveedor >= totalCostoProveedorLive
  const saldoPendienteProveedor = Math.max(0, totalCostoProveedorLive - totalPagadoProveedor)
  const totalVentaLive = totalRepuestos + totalLavado
  const totalRepuestosLive = totalRepuestos
  const totalManoObraLive = totalManoObra
  const totalLive = totalRepuestosLive + totalManoObraLive
  const total = totalRepuestos + totalManoObra
  const saldo = total - (parseFloat(valorAbono) || 0)
  const esFaltaRevision = orden.estado === 'falta_revision'
  const categoriaNombreActual = editingOrden === 'categoria'
    ? (categorias.find(c => c.id === editCategoriaId)?.nombre ?? orden.categorias_servicio?.nombre ?? '')
    : (orden.categorias_servicio?.nombre ?? '')
  const esUMA = categoriaNombreActual.toLowerCase().includes('uma')
  const esVenta = orden.tipo_orden === 'venta_repuestos'
  umaSinNumeroRef.current = esUMA && numerosOrdenUMA.length === 0
  // El pago ya quedó completo (con lo guardado) pero el estado de la orden todavía no
  // refleja eso — al salir de la página se le pregunta si quiere marcarla como Pagada.
  const totalPagadoClienteGlobal = pagosOrden.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
  const totalAPagarGuardadoGlobal = total + totalLavado
  pagoCompletoSinMarcarRef.current = !['pagado', 'listo'].includes(orden.estado) &&
    totalAPagarGuardadoGlobal > 0 && totalPagadoClienteGlobal >= totalAPagarGuardadoGlobal

  const imprimirConIframe = (html: string) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;opacity:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* ya eliminado */ } }, 2000)
    }, 350)
  }

  const handlePrint = (formato: 'carta' | 'termica') => {
    setShowPrintModal(false)
    const isTermica = formato === 'termica'
    const margin = isTermica ? '5mm' : '18mm'
    const fechaEntrada = new Date(orden.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    const fechaFin = orden.fecha_finalizacion
      ? new Date(orden.fecha_finalizacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
      : null
    const ahora = new Date().toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const repHTML = repuestosItems.map((item, idx) =>
      `<tr><td style="padding:3px 0;border-bottom:1px dotted #ccc;">${idx + 1}. ${item.descripcion}${item.cantidad > 1 ? ` ×${item.cantidad}` : ''}</td><td style="padding:3px 0;border-bottom:1px dotted #ccc;text-align:right;white-space:nowrap;">$${(item.precio_venta * item.cantidad).toLocaleString('es-CO')}</td></tr>`
    ).join('')
    const moHTML = manoObraItems.map((item, idx) =>
      `<tr><td style="padding:3px 0;border-bottom:1px dotted #ccc;">${idx + 1}. ${item.descripcion}</td><td style="padding:3px 0;border-bottom:1px dotted #ccc;text-align:right;white-space:nowrap;">$${item.precio_venta.toLocaleString('es-CO')}</td></tr>`
    ).join('')
    const lmHTML = lavaMotoOrdenes.map((lm, idx) =>
      `<tr><td style="padding:3px 0;border-bottom:1px dotted #ccc;">${idx + 1}. Lava Moto${lm.cantidad > 1 ? ` ×${lm.cantidad}` : ''}</td><td style="padding:3px 0;border-bottom:1px dotted #ccc;text-align:right;white-space:nowrap;">$${(lm.precio_venta_unitario * lm.cantidad).toLocaleString('es-CO')}</td></tr>`
    ).join('')
    const lmTotalPrint = lavaMotoOrdenes.reduce((s, r) => s + r.precio_venta_unitario * r.cantidad, 0)
    const totalConLM = total + lmTotalPrint
    const esGeneral = tipoFactura === 'general'
    const nombreEncabezado = esGeneral ? 'Centro de Diagnóstico de Motos' : tenantNombre.toUpperCase()
    const tituloFactura = esGeneral ? 'REFERENCIA' : 'FACTURA'
    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${tituloFactura} #${orden.numero}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${isTermica ? "'Courier New',monospace" : 'Arial,sans-serif'};font-size:${isTermica ? '11px' : '12px'};color:#000;padding:${margin};width:${isTermica ? '80mm' : 'auto'}}
@page{size:${isTermica ? '80mm auto' : 'letter'};margin:${margin}}
table{width:100%;border-collapse:collapse}
.c{text-align:center}.b{font-weight:bold}.sm{font-size:${isTermica ? '9px' : '10px'};color:#555}
hr{border:none;border-top:${isTermica ? '1px dashed #000' : '1px solid #ccc'};margin:5px 0}
</style></head><body>
<div class="c b" style="font-size:${isTermica ? '18px' : '24px'};letter-spacing:3px;margin-bottom:2px">${nombreEncabezado.toUpperCase()}</div>
<div class="c sm" style="margin-bottom:6px">Taller de Motos</div>
<hr>
<div class="c b" style="font-size:${isTermica ? '13px' : '16px'};margin:4px 0">${tituloFactura} #${orden.numero}</div>
<hr>
<table style="margin:4px 0 6px">
<tr><td class="sm" style="width:42%">Cliente:</td><td class="sm b">${orden.cliente}</td></tr>
${orden.placa ? `<tr><td class="sm">Placa:</td><td class="sm b">${orden.placa}</td></tr>` : ''}
${orden.telefono ? `<tr><td class="sm">Teléfono:</td><td class="sm">${orden.telefono}</td></tr>` : ''}
<tr><td class="sm">Fecha entrada:</td><td class="sm">${fechaEntrada}</td></tr>
${fechaFin ? `<tr><td class="sm">Fecha salida:</td><td class="sm">${fechaFin}</td></tr>` : ''}
</table>
<hr>
${repuestosItems.length > 0 ? `<div class="b sm" style="margin:3px 0 4px">REPUESTOS</div><table>${repHTML}</table>` : ''}
${manoObraItems.length > 0 ? `${repuestosItems.length > 0 ? '<hr>' : ''}<div class="b sm" style="margin:3px 0 4px">MANO DE OBRA</div><table>${moHTML}</table>` : ''}
${lavaMotoOrdenes.length > 0 ? `${(repuestosItems.length > 0 || manoObraItems.length > 0) ? '<hr>' : ''}<div class="b sm" style="margin:3px 0 4px">LAVA MOTO</div><table>${lmHTML}</table>` : ''}
<hr>
<table><tr>
<td class="b" style="font-size:${isTermica ? '14px' : '15px'}">TOTAL</td>
<td class="b" style="text-align:right;font-size:${isTermica ? '14px' : '15px'}">$${totalConLM.toLocaleString('es-CO')}</td>
</tr></table>
<div class="c sm" style="margin:6px 0;font-style:italic">* Precios incluyen impuestos *</div>
<hr>
<div class="c sm" style="margin-top:4px">Impreso: ${ahora}</div>
<div class="c" style="margin-top:10px;font-size:${isTermica ? '11px' : '12px'}">¡Gracias por su preferencia!</div>
</body></html>`
    imprimirConIframe(html)
  }

  return (
    <>
    {seguimientoOpen && orden && (
      <SeguimientoModal
        nombreInicial={orden.cliente}
        celularInicial={orden.telefono ?? ''}
        onSuccess={(_id, nombre) => {
          setSeguimientoOpen(false)
          setClienteEnSeguimiento(true)
          setSeguimientoToast(`✅ ${nombre || 'Cliente'} agregado a Seguimiento de Ventas`)
          setTimeout(() => setSeguimientoToast(null), 4000)
        }}
        onClose={() => setSeguimientoOpen(false)}
      />
    )}
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Dialog finalizar orden / marcar como pagada */}
      {finalizeDialogModo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{finalizeDialogModo === 'finalizar' ? 'Orden pagada' : 'El pago ya está completo'}</h3>
                <p className="text-xs text-gray-500">El pago está completo</p>
              </div>
            </div>
            {finalizeDialogModo === 'finalizar' ? (
              <p className="text-sm text-gray-600">¿Deseas mover el estado de <strong>{orden?.placa ?? 'esta moto'}</strong> a <strong>Finalizado</strong>?</p>
            ) : (
              <p className="text-sm text-gray-600">El cliente ya pagó el total de <strong>{orden?.placa ?? 'esta moto'}</strong>, pero el estado sigue como <strong>{orden?.estado === 'en_proceso' ? 'En proceso' : orden?.estado === 'pendiente' ? 'Pendiente' : orden?.estado === 'programado' ? 'Programado' : orden?.estado}</strong>. ¿Deseas marcarla como <strong>Pagada</strong>?</p>
            )}
            <div className="space-y-2">
              {finalizeDialogModo === 'finalizar' ? (
                <>
                  <button
                    disabled={savingFinalize}
                    onClick={async () => {
                      setSavingFinalize(true)
                      const { error: finError } = await supabase.from('ordenes').update({
                        estado: 'listo',
                        fecha_finalizacion: new Date().toISOString(),
                      }).eq('id', ordenId)
                      setSavingFinalize(false)
                      if (finError) { alert(`No se pudo finalizar: ${finError.message}`); return }
                      setEstado('listo' as EstadoOrden)
                      setFinalizeDialogModo(null)
                      if (pendingNavUrl) { router.push(pendingNavUrl); setPendingNavUrl(null) }
                      else if (pendingNavBack) { skipNextPopstate.current = true; router.back() }
                    }}
                    className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {savingFinalize ? 'Guardando...' : 'Sí, marcar como Finalizada'}
                  </button>
                  <button
                    disabled={savingFinalize}
                    onClick={async () => {
                      setSavingFinalize(true)
                      const { error: pagError } = await supabase.from('ordenes').update({ estado: 'pagado' }).eq('id', ordenId)
                      setSavingFinalize(false)
                      if (pagError) { alert(`No se pudo guardar: ${pagError.message}`); return }
                      setEstado('pagado' as EstadoOrden)
                      setFinalizeDialogModo(null)
                      if (pendingNavUrl) { router.push(pendingNavUrl); setPendingNavUrl(null) }
                      else if (pendingNavBack) { skipNextPopstate.current = true; router.back() }
                    }}
                    className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {savingFinalize ? 'Guardando...' : 'No, mantener como Pagada'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={savingFinalize}
                    onClick={async () => {
                      setSavingFinalize(true)
                      const { error: pagError } = await supabase.from('ordenes').update({ estado: 'pagado' }).eq('id', ordenId)
                      setSavingFinalize(false)
                      if (pagError) { alert(`No se pudo guardar: ${pagError.message}`); return }
                      setEstado('pagado' as EstadoOrden)
                      setFinalizeDialogModo(null)
                      if (pendingNavUrl) { router.push(pendingNavUrl); setPendingNavUrl(null) }
                      else if (pendingNavBack) { skipNextPopstate.current = true; router.back() }
                    }}
                    className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {savingFinalize ? 'Guardando...' : 'Sí, marcar como Pagada'}
                  </button>
                  <button
                    disabled={savingFinalize}
                    onClick={() => {
                      setFinalizeDialogModo(null)
                      if (pendingNavUrl) { router.push(pendingNavUrl); setPendingNavUrl(null) }
                      else if (pendingNavBack) { skipNextPopstate.current = true; router.back() }
                    }}
                    className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    No, dejarla como está
                  </button>
                </>
              )}
              <button
                onClick={() => { setFinalizeDialogModo(null); setPendingNavBack(false); setPendingNavUrl(null) }}
                className="w-full py-1.5 text-gray-400 hover:text-gray-600 text-xs transition-colors"
              >
                Cancelar (quedarme aquí)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seleccionar formato de impresión */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Imprimir factura</h3>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-500">Tipo de factura:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTipoFactura('normal')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tipoFactura === 'normal' ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setTipoFactura('general')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tipoFactura === 'general' ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                General
              </button>
            </div>
            <p className="text-sm text-gray-500">Selecciona el formato de impresión:</p>
            <div className="space-y-2">
              <button
                onClick={() => handlePrint('carta')}
                className="w-full py-3 px-4 bg-white border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl text-sm transition-colors text-left flex items-center gap-3"
              >
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <div className="font-semibold text-gray-800">Hoja carta</div>
                  <div className="text-xs text-gray-400">Impresora estándar · Tamaño carta</div>
                </div>
              </button>
              <button
                onClick={() => handlePrint('termica')}
                className="w-full py-3 px-4 bg-white border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl text-sm transition-colors text-left flex items-center gap-3"
              >
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <div>
                  <div className="font-semibold text-gray-800">Impresora térmica</div>
                  <div className="text-xs text-gray-400">Recibo · 80mm ancho</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (orden.estado === 'pagado' && !(esUMA && numerosOrdenUMA.length === 0)) {
                setPendingNavBack(true); setPendingNavUrl(null)
                setFinalizeDialogModo('finalizar')
              } else if (pagoCompletoSinMarcarRef.current) {
                setPendingNavBack(true); setPendingNavUrl(null)
                setFinalizeDialogModo('marcar_pagado')
              } else {
                skipNextPopstate.current = true
                router.back()
              }
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{orden.placa ?? '—'}</h1>
              <span className="text-gray-400">#{orden.numero}</span>
              {esVenta && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Venta repuestos</span>
              )}
              {esUMA && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">UMA</span>
              )}
              <OrderStatus estado={orden.estado} />
              <PaymentStatus estado={orden.estado_pago} metodoPago={(orden.metodos_pago as { nombre: string } | null)?.nombre} />
            </div>
            <p className="text-gray-600 mt-0.5">{orden.cliente}</p>
            {orden.categorias_servicio && (
              <p className="text-sm text-gray-400">
                {orden.categorias_servicio.nombre}
                {(() => {
                  const allSubs = categorias.flatMap(c => c.subcategorias_servicio)
                  const ids = orden.subcategoria_servicio_ids?.length ? orden.subcategoria_servicio_ids : orden.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : []
                  const nombres = ids.map(id => allSubs.find(s => s.id === id)?.nombre ?? orden.subcategorias_servicio?.nombre).filter(Boolean)
                  return nombres.length > 0 ? ` · ${nombres.join(' · ')}` : null
                })()}
              </p>
            )}
            <div className="flex flex-wrap gap-3 mt-1">
              {editandoFecha === 'entrada' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="datetime-local"
                    value={fechaInputValue}
                    onChange={(e) => setFechaInputValue(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    autoFocus
                  />
                  <button onClick={handleGuardarFecha} disabled={savingFecha} className="text-green-600 hover:text-green-800 p-0.5" title="Guardar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button onClick={() => setEditandoFecha(null)} disabled={savingFecha} className="text-gray-400 hover:text-red-500 p-0.5" title="Cancelar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium text-gray-500">Entrada:</span> {formatFechaCorta(orden.created_at)}
                  {esGerencia && (
                    <button onClick={() => abrirEditarFecha('entrada')} className="text-gray-300 hover:text-blue-600 ml-0.5" title="Editar fecha de entrada (gerencia)">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </span>
              )}

              {editandoFecha === 'salida' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="datetime-local"
                    value={fechaInputValue}
                    onChange={(e) => setFechaInputValue(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    autoFocus
                  />
                  <button onClick={handleGuardarFecha} disabled={savingFecha} className="text-green-600 hover:text-green-800 p-0.5" title="Guardar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button onClick={() => setEditandoFecha(null)} disabled={savingFecha} className="text-gray-400 hover:text-red-500 p-0.5" title="Cancelar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : orden.fecha_finalizacion ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Salida:</span> {formatFechaCorta(orden.fecha_finalizacion)}
                  {esGerencia && (
                    <button onClick={() => abrirEditarFecha('salida')} className="text-green-300 hover:text-blue-600 ml-0.5" title="Editar fecha de salida (gerencia)">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </span>
              ) : esGerencia ? (
                <button onClick={() => abrirEditarFecha('salida')} className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Registrar salida
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {/* Acciones del header */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowPrintModal(true)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Imprimir factura"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
          <button
            onClick={() => { setShowAudit(true); cargarAudit() }}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Ver historial de cambios"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {esGerencia && (
            <button
              onClick={handleDeleteOrden}
              disabled={deletingOrden}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title="Eliminar esta entrada (solo gerencia)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda — Descripción, Ítems y medios */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info OT UMA */}
          {esUMA && (orden.numero_ot || orden.nota_ot) && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Orden de trabajo UMA</p>
              {orden.numero_ot && (
                <p className="text-sm text-purple-900"><span className="font-medium">N° OT:</span> {orden.numero_ot}</p>
              )}
              {orden.nota_ot && (
                <p className="text-sm text-purple-700 whitespace-pre-wrap">{orden.nota_ot}</p>
              )}
            </div>
          )}

          {/* Datos del ingreso — editables por el administrador */}
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setAbiertoDatos((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-gray-50 text-left"
            >
              {abiertoDatos ? (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Datos del ingreso</p>
              ) : (
                <p className="text-sm font-semibold text-gray-900">{orden.placa ?? '—'} · <span className="font-normal text-gray-600">{orden.cliente}</span></p>
              )}
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${abiertoDatos ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {abiertoDatos && (
            <>
            {/* Placa */}
            <div className="px-5 py-3">
              {editingOrden === 'placa' ? (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-medium">Placa</label>
                  <input autoFocus value={editPlaca} onChange={(e) => setEditPlaca(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => guardarCampoOrden('placa')} disabled={savingOrden}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {savingOrden ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setEditingOrden(null); setEditPlaca(orden.placa ?? '') }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Placa</p>
                    <p className="text-sm font-semibold text-gray-900">{orden.placa ?? '—'}</p>
                  </div>
                  <button onClick={() => setEditingOrden('placa')} className="text-gray-400 hover:text-blue-600 p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Vehículo */}
            {orden.motos && (
              <div className="px-5 py-3">
                <p className="text-xs text-gray-400 mb-1">Vehículo</p>
                <Link href={`/admin/motos/${orden.motos.id}`}
                  className="group flex items-start gap-3 hover:bg-blue-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                  <span className="text-xl mt-0.5">🏍️</span>
                  <div className="min-w-0">
                    {(orden.motos.marca || orden.motos.modelo) ? (
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">
                        {[orden.motos.marca, orden.motos.modelo].filter(Boolean).join(' ')}
                        {orden.motos.año ? ` ${orden.motos.año}` : ''}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Sin datos del vehículo</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        orden.motos.color,
                        orden.motos.kilometraje ? `${orden.motos.kilometraje.toLocaleString('es-CO')} km` : null,
                      ].filter(Boolean).join(' · ') || null}
                    </p>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 ml-auto mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}

            {/* Cliente */}
            <div className="px-5 py-3">
              {editingOrden === 'cliente' ? (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-medium">Nombre del cliente</label>
                  <input autoFocus value={editCliente} onChange={(e) => setEditCliente(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => guardarCampoOrden('cliente')} disabled={savingOrden}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {savingOrden ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setEditingOrden(null); setEditCliente(orden.cliente) }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">Cliente</p>
                      <p className="text-sm font-semibold text-gray-900">{orden.cliente}</p>
                    </div>
                    <button onClick={() => setEditingOrden('cliente')} className="text-gray-400 hover:text-blue-600 p-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                  {clienteEnSeguimiento ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs font-semibold text-emerald-700">Vinculado — Seguimiento Ventas</span>
                      </div>
                      <a
                        href={`/admin/ventas${orden.cliente_id ? `?abrir=${orden.cliente_id}` : ''}`}
                        className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Ver seguimiento cliente
                      </a>
                      {esGerencia && (
                        <button
                          onClick={() => setSeguimientoOpen(true)}
                          className="w-full py-1.5 px-3 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg text-xs font-medium transition-colors">
                          ✏️ Editar vinculación
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSeguimientoOpen(true)}
                        className="w-full py-1.5 px-3 border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold transition-colors">
                        + Agregar / Vincular a Seguimiento de Ventas
                      </button>
                      {seguimientoToast && (
                        <p className="text-xs text-emerald-600 font-medium">{seguimientoToast}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tipo de ingreso: UMA/Terceros + categoría, una sola pregunta */}
            <div className="px-5 py-3">
              {editingOrden === 'categoria' ? (
                <div className="space-y-3">
                  <label className="text-xs text-gray-500 font-medium">Tipo de ingreso</label>
                  {orden.tipo_orden !== 'venta_repuestos' && (
                    <div className="flex gap-2">
                      {([
                        { value: 'terceros', label: 'Terceros / Independiente' },
                        { value: 'uma', label: 'UMA (Autorizado)' },
                      ] as { value: 'terceros' | 'uma'; label: string }[]).map((t) => (
                        <button key={t.value} type="button"
                          onClick={() => { setEditTipoServicio(t.value); setEditCategoriaId(''); setEditSubcategoriaIds([]) }}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            editTipoServicio === t.value
                              ? t.value === 'uma' ? 'bg-purple-700 text-white' : 'bg-amber-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {categorias
                      .filter((c) => orden.tipo_orden === 'venta_repuestos' || !editTipoServicio || c.nombre.toLowerCase().includes('uma') === (editTipoServicio === 'uma'))
                      .map((c) => (
                      <button key={c.id} type="button"
                        onClick={() => { setEditCategoriaId(editCategoriaId === c.id ? '' : c.id); setEditSubcategoriaIds([]) }}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                          editCategoriaId === c.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                        }`}>
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const subs = categorias.find((c) => c.id === editCategoriaId)?.subcategorias_servicio ?? []
                    return subs.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {subs.map((s) => (
                          <button key={s.id} type="button"
                            onClick={() => setEditSubcategoriaIds(prev =>
                              prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                            )}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                              editSubcategoriaIds.includes(s.id)
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                            }`}>
                            {s.nombre}
                          </button>
                        ))}
                      </div>
                    ) : null
                  })()}
                  <div className="flex gap-2">
                    <button onClick={() => guardarCampoOrden('categoria')} disabled={savingOrden}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {savingOrden ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => {
                      setEditingOrden(null)
                      setEditCategoriaId(orden.categoria_servicio_id ?? '')
                      setEditSubcategoriaIds(orden.subcategoria_servicio_ids?.length ? orden.subcategoria_servicio_ids : orden.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : [])
                      setEditTipoServicio((orden.tipo_servicio as 'terceros' | 'uma' | null) ?? '')
                    }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">Tipo de ingreso</p>
                      {orden.tipo_orden !== 'venta_repuestos' && (
                        orden.tipo_servicio ? (
                          <span className={`inline-block mb-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            orden.tipo_servicio === 'uma' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {orden.tipo_servicio === 'uma' ? 'UMA (Autorizado)' : 'Terceros / Independiente'}
                          </span>
                        ) : (
                          <span className="inline-block mb-0.5 text-xs text-red-500 italic font-medium">⚠ Sin definir</span>
                        )
                      )}
                      <p className="text-sm font-semibold text-gray-900">
                        {orden.categorias_servicio?.nombre
                          ? <>
                              {orden.categorias_servicio.nombre}
                              {(() => {
                                const allSubs = categorias.flatMap(c => c.subcategorias_servicio)
                                const ids = orden.subcategoria_servicio_ids?.length ? orden.subcategoria_servicio_ids : orden.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : []
                                const nombres = ids.map(id => allSubs.find(s => s.id === id)?.nombre ?? orden.subcategorias_servicio?.nombre).filter(Boolean)
                                return nombres.length > 0 ? <span className="text-gray-500 font-normal"> · {nombres.join(' · ')}</span> : null
                              })()}
                            </>
                          : <span className="text-gray-400 italic font-normal">Sin tipo</span>
                        }
                      </p>
                    </div>
                    <button onClick={() => setEditingOrden('categoria')} className="text-gray-400 hover:text-blue-600 p-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                  {esUMA && numerosOrdenUMA.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">⚠ Agrega el # de orden UMA en el panel derecho</p>
                  )}
                </div>
              )}
            </div>

            {/* Descripción / Garantías */}
            <div className="px-5 py-3">
              {editingOrden === 'descripcion' ? (
                esGarantia ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-medium">Manifiesta el Cliente:</label>
                      <textarea autoFocus value={editManifiestaCliente} onChange={(e) => setEditManifiestaCliente(e.target.value)}
                        rows={3} placeholder="Qué reporta el cliente..."
                        className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 font-medium">Diagnóstico:</label>
                      <textarea value={editDiagnostico} onChange={(e) => setEditDiagnostico(e.target.value)}
                        rows={3} placeholder="Diagnóstico del taller..."
                        className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => guardarCampoOrden('descripcion')} disabled={savingOrden}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                        {savingOrden ? '...' : 'Guardar'}
                      </button>
                      <button onClick={() => { setEditingOrden(null); setEditManifiestaCliente(orden.manifiesta_cliente ?? ''); setEditDiagnostico(orden.diagnostico ?? '') }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-medium">Descripción del trabajo</label>
                    <textarea autoFocus value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)}
                      rows={3} placeholder="Describe el trabajo..."
                      className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none" />
                    <div className="flex gap-2">
                      <button onClick={() => guardarCampoOrden('descripcion')} disabled={savingOrden}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                        {savingOrden ? '...' : 'Guardar'}
                      </button>
                      <button onClick={() => { setEditingOrden(null); setEditDescripcion(orden.descripcion ?? '') }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                    </div>
                  </div>
                )
              ) : esGarantia ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-xs text-gray-400">Manifiesta el Cliente:</p>
                      <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                        {orden.manifiesta_cliente || <span className="text-gray-400 italic">Sin información</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Diagnóstico:</p>
                      <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                        {orden.diagnostico || <span className="text-gray-400 italic">Sin información</span>}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setEditingOrden('descripcion')} className="text-gray-400 hover:text-blue-600 p-1 flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">Descripción del trabajo</p>
                    <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                      {orden.descripcion || <span className="text-gray-400 italic">Sin descripción</span>}
                    </p>
                  </div>
                  <button onClick={() => setEditingOrden('descripcion')} className="text-gray-400 hover:text-blue-600 p-1 flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            </>
            )}
          </div>

          {/* Medios */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={() => setAbiertoFotos((v) => !v)} className="flex items-center gap-2 text-left">
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${abiertoFotos ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <h2 className="font-semibold text-gray-900">
                  {abiertoFotos
                    ? 'Fotos y videos'
                    : `${medios.filter((m) => m.tipo === 'imagen').length} fotos · ${medios.filter((m) => m.tipo === 'video').length} videos`}
                </h2>
              </button>
              <div className="flex items-center gap-2">
                {/* Input fotos (OPPO necesita input separado para imágenes) */}
                <input
                  ref={fileInputMedioRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                  onChange={(e) => handleUploadMedio(e, 'imagen')}
                  className="hidden"
                />
                {/* Input videos con tipos explícitos (OPPO ColorOS ignora video/* genérico) */}
                <input
                  ref={fileInputVideoRef}
                  type="file"
                  accept="video/mp4,video/3gpp,video/3gpp2,video/webm,video/quicktime,video/x-matroska,video/mpeg,.mp4,.3gp,.mov,.avi,.mkv,.webm,.m4v,.wmv,.flv,application/octet-stream"
                  onChange={(e) => handleUploadMedio(e, 'video')}
                  className="hidden"
                />
                {uploadingMedio ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium min-w-[90px] justify-center">
                    <svg className="animate-spin w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {uploadStage === 'comprimiendo' ? 'Comprimiendo...'
                      : uploadProgress > 0 && uploadProgress <= 40 ? `Leyendo ${uploadProgress * 2.5 | 0}%`
                      : uploadProgress > 40 ? `Subiendo ${uploadProgress}%`
                      : 'Preparando...'}
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => fileInputMedioRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                      title="Agregar foto"
                    >
                      📷 Foto
                    </button>
                    <button
                      onClick={() => fileInputVideoRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-colors"
                      title="Agregar video (hasta 1 minuto)"
                    >
                      🎥 Video
                    </button>
                  </>
                )}
              </div>
            </div>
            {abiertoFotos && (
              <>
                {uploadError && (
                  <div className="mx-0 mb-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                    <span className="text-red-500 text-sm flex-shrink-0">⚠️</span>
                    <p className="text-xs text-red-700">{uploadError}</p>
                    <button onClick={() => setUploadError('')} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                )}
                <MediaGallery medios={medios} onDelete={handleDeleteMedio} />
              </>
            )}
          </div>

          {/* ── COMENTARIOS ── */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Comentarios {comentariosOrden.length > 0 && <span className="text-xs font-normal text-gray-400">({comentariosOrden.length})</span>}
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {comentariosOrden.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">Sin comentarios todavía.</p>
              )}
              {comentariosOrden.map((c) => (
                <div key={c.id} className="flex gap-3 group">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {(c.usuarios?.nombre ?? 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{c.usuarios?.nombre ?? 'Usuario'}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(c.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{new Date(c.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 break-words">{c.comentario}</p>
                  </div>
                  {(esGerencia || c.usuario_id === profile?.id) && (
                    <button
                      onClick={() => handleDeleteComentario(c.id)}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 flex-shrink-0 self-start mt-0.5"
                      title="Eliminar comentario"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-1 border-t border-gray-100">
                <textarea
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComentario() } }}
                  placeholder="Escribe un comentario... (Enter para enviar)"
                  rows={2}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={handleAddComentario}
                  disabled={savingComentario || !nuevoComentario.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-semibold transition-colors self-end"
                >
                  {savingComentario ? '...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>

          {/* ── LAVADO DE MOTO — no aplica a venta directa de repuestos ── */}
          {!esVenta && (
          <div className="rounded-xl border-2 border-cyan-100 overflow-hidden">
            <div className="bg-cyan-600 px-5 py-3.5">
              <h2 className="text-white font-bold text-base">Agregar lavado de moto</h2>
            </div>
            <div className="bg-white">
              <div className="p-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={toggleAgregarLavado}
                  className="w-full py-2.5 px-3 border-2 border-dashed border-cyan-300 hover:border-cyan-500 hover:bg-cyan-50 text-cyan-600 hover:text-cyan-800 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar lavado
                </button>
              </div>

              {mostrarLavado && !lavadoQuick.editId && (
                <div className="px-5 py-4 border-b border-gray-100 bg-cyan-50/40">
                  {formularioLavado(confirmarAgregarLavado, 'Agregar', () => setMostrarLavado(false))}
                </div>
              )}

              {lavaMotoOrdenes.length > 0 && (
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b bg-cyan-50">
                      <th className="text-left py-2 px-3 font-medium w-16">Origen</th>
                      <th className="text-left py-2 px-3 font-medium">Descripción</th>
                      <th className="text-left py-2 px-3 font-medium w-28">Método prov.</th>
                      <th className="text-right py-2 px-3 font-medium w-24">P. proveedor</th>
                      <th className="text-right py-2 px-3 font-medium w-24">P. venta</th>
                      <th className="text-right py-2 px-3 font-medium w-24">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lavaMotoOrdenes.map((lm) => (
                      lavadoQuick.editId === lm.id ? (
                        <tr key={lm.id} className="border-b bg-cyan-50/40">
                          <td colSpan={6} className="py-3 px-4">
                            {formularioLavado(confirmarEditarLavado, 'Guardar', cancelarEditarLavado)}
                          </td>
                        </tr>
                      ) : (
                        <tr key={lm.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3"><Badge variant="teal">Lavado</Badge></td>
                          <td className="py-2 px-3 text-gray-800 truncate">Lavado de moto{lm.cantidad > 1 ? ` ×${lm.cantidad}` : ''}</td>
                          <td className="py-2 px-3 text-gray-500 text-xs truncate">{lm.metodos_pago?.nombre ?? '—'}</td>
                          <td className="py-2 px-3 text-right text-gray-500 text-sm whitespace-nowrap">{formatCOP(lm.costo_unitario * lm.cantidad)}</td>
                          <td className="py-2 px-3 text-right font-semibold whitespace-nowrap">{formatCOP(lm.precio_venta_unitario * lm.cantidad)}</td>
                          <td className="py-2 px-3">{accionesRepuesto(() => iniciarEditarLavado(lm), () => handleDeleteLavaMoto(lm.id), celdaFechaLavado(lm))}</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}

          {/* ── REPUESTOS ── */}
          <div className="rounded-xl border-2 border-blue-100 overflow-hidden">
            {/* Header azul */}
            <button
              type="button"
              onClick={() => setAbiertoRepuestos((v) => !v)}
              className="w-full text-left bg-blue-600 px-5 py-3.5 flex items-center justify-between gap-3"
            >
              <h2 className="text-white font-bold text-base">Ingresa los repuestos</h2>
              <div className="flex items-center gap-3">
                {!abiertoRepuestos && (
                  <div className="text-right text-xs text-blue-100 leading-tight">
                    <p>Costo prov.: {formatCOP(totalCostoProveedorLive)}</p>
                    <p>Venta: {formatCOP(totalVentaLive)}</p>
                  </div>
                )}
                <svg className={`w-4 h-4 text-blue-100 flex-shrink-0 transition-transform ${abiertoRepuestos ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {abiertoRepuestos && (
            <div className="bg-white">
              {/* Botón para agregar repuesto */}
              <div className="p-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAgregarRepuesto(true)}
                  className="w-full py-2.5 px-3 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 text-blue-600 hover:text-blue-800 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar repuesto
                </button>
              </div>

              {/* Lista de repuestos agregados (UMA / Externo / Insumo / Porta Placas) */}
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 uppercase border-b bg-blue-50">
                    <th className="text-left py-1 px-2 font-medium w-28">Origen / Ref.</th>
                    <th className="text-left py-1 px-2 font-medium">Descripción</th>
                    <th className="text-center py-1 px-2 font-medium w-16">Q</th>
                    <th className="text-left py-1 px-2 font-medium w-20 hidden sm:table-cell">Método prov.</th>
                    <th className="text-right py-1 px-2 font-medium w-20 hidden sm:table-cell">Costo</th>
                    <th className="text-right py-1 px-2 font-medium w-20">P. venta</th>
                    <th className="text-right py-1 px-2 font-medium w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {repuestosItems.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-xs text-gray-400">Sin repuestos agregados todavía.</td></tr>
                  )}
                  {repuestosItems.map((item) => {
                    const tipoLabel = item.origen === 'uma' ? 'UMA' : item.origen === 'externo' ? 'Externo' : item.descripcion === 'Porta Placas' ? 'Porta Placas' : 'Insumo'
                    const tipoColor = item.origen === 'uma' ? 'blue' : item.origen === 'externo' ? 'amber' : 'purple'
                    const sepIdx = item.descripcion.indexOf(' - ')
                    const refCode = item.origen === 'externo' ? 'REPEXT' : item.origen === 'uma' && sepIdx > 0 ? item.descripcion.slice(0, sepIdx) : '—'
                    const descClean = item.origen === 'uma' && sepIdx > 0 ? item.descripcion.slice(sepIdx + 3) : item.descripcion
                    return editingItem?.id === item.id ? (
                      <tr key={item.id} className="border-b bg-blue-50/40">
                        <td className="py-1 px-2">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={tipoColor}>{tipoLabel}</Badge>
                            {refCode !== '—' && <span className="text-xs font-mono font-semibold text-gray-600 leading-none">{refCode}</span>}
                          </div>
                        </td>
                        <td className="py-1 px-2">
                          <input
                            value={editingItem.descripcion}
                            onChange={(e) => setEditingItem({ ...editingItem, descripcion: e.target.value })}
                            autoFocus
                            placeholder="Nombre del repuesto"
                            className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none"
                          />
                        </td>
                        <td className="py-1 px-2">
                          <input
                            type="number"
                            min="1"
                            value={editingItem.cantidad}
                            onChange={(e) => setEditingItem({ ...editingItem, cantidad: e.target.value })}
                            className="w-full px-1 py-1 border border-blue-300 rounded-lg text-sm font-mono text-center focus:outline-none"
                          />
                        </td>
                        <td className="py-1 px-2 hidden sm:table-cell">
                          {item.origen === 'externo' ? (
                            <select
                              value={editingItem.metodo_pago_id}
                              onChange={(e) => setEditingItem({ ...editingItem, metodo_pago_id: e.target.value })}
                              className="w-full px-1.5 py-1 border border-blue-300 rounded-lg text-xs focus:outline-none bg-white"
                            >
                              <option value="">—</option>
                              {metodosPago.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                            </select>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-1 px-2 hidden sm:table-cell">
                          {item.origen === 'externo' ? (
                            <PriceInput
                              value={editingItem.costo}
                              onChange={(v) => setEditingItem({ ...editingItem, costo: v })}
                              className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm font-mono text-right focus:outline-none"
                            />
                          ) : <span className="text-gray-300 block text-center">—</span>}
                        </td>
                        <td className="py-1 px-2">
                          <PriceInput
                            value={editingItem.precio}
                            onChange={(v) => setEditingItem({ ...editingItem, precio: v, errMsg: '' })}
                            className={`w-full px-2 py-1 border rounded-lg text-sm font-mono text-right focus:outline-none ${editingItem.errMsg ? 'border-red-400' : 'border-blue-300'}`}
                          />
                          {editingItem.errMsg && <p className="text-xs text-red-500 mt-0.5 text-right">{editingItem.errMsg}</p>}
                          {editingItem.precioMin !== null && !editingItem.errMsg && (
                            <p className="text-xs text-gray-400 mt-0.5 text-right">Mín: {formatCOP(editingItem.precioMin)}</p>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={handleEditItem} className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold">OK</button>
                            <button onClick={() => setEditingItem(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className={`border-b hover:bg-gray-50 ${gestionaProveedor && !proveedorPagadoCompleto && item.origen === 'externo' ? 'bg-yellow-50' : ''}`}>
                        <td className="py-1.5 px-2">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={tipoColor}>{tipoLabel}</Badge>
                            {refCode !== '—' && <span className="text-xs font-mono font-semibold text-gray-600 leading-none">{refCode}</span>}
                            {gestionaProveedor && !proveedorPagadoCompleto && item.origen === 'externo' && (
                              <span className="text-xs text-amber-600 font-medium">⏳ prov. pendiente</span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-gray-800 truncate" title={descClean}>{descClean}</td>
                        <td className="py-1.5 px-2 text-center text-sm font-mono text-gray-700">{item.cantidad}</td>
                        <td className="py-1.5 px-2 text-gray-500 text-xs hidden sm:table-cell">{item.origen === 'externo' ? (metodosPago.find((m) => m.id === item.metodo_pago_id)?.nombre ?? '—') : '—'}</td>
                        <td className="py-1.5 px-2 text-right text-gray-500 whitespace-nowrap hidden sm:table-cell">{item.origen === 'externo' ? formatCOP(item.costo) : '—'}</td>
                        <td className="py-1.5 px-2 text-right font-semibold whitespace-nowrap">{formatCOP(item.precio_venta)}</td>
                        <td className="py-1.5 px-2">{accionesRepuesto(() => iniciarEditarItem(item), () => handleDeleteItem(item), celdaFecha(item))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="px-5 py-3 border-t space-y-1 text-sm font-semibold bg-blue-50">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total costo proveedor</span>
                  <span className="text-gray-900">{formatCOP(totalCostoProveedorLive)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Total precio venta cliente</span>
                  <span className="text-blue-900">{formatCOP(totalVentaLive)}</span>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Modal "+ Agregar repuesto" */}
          {profile?.tenant_id && (
            <ConsultaRepuestos
              open={showAgregarRepuesto}
              onClose={() => setShowAgregarRepuesto(false)}
              tenantId={profile.tenant_id}
              onAdd={handleAddItem}
              permitirInsumos
            />
          )}

          {/* ── MANO DE OBRA — no aplica a venta directa de repuestos ── */}
          {!esVenta && (
          <div className="rounded-xl border-2 border-orange-100 overflow-hidden">
            {/* Header naranja */}
            <div className="bg-orange-500 px-5 py-3.5">
              <h2 className="text-white font-bold text-base">Ingresa la mano de obra</h2>
            </div>

            <div className="bg-white">
              {/* Botón para agregar mano de obra */}
              <div className="p-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setMostrarFormMo((v) => !v)}
                  className="w-full py-2.5 px-3 border-2 border-dashed border-orange-300 hover:border-orange-500 hover:bg-orange-50 text-orange-600 hover:text-orange-800 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar mano de obra
                </button>
              </div>

              {/* Formulario para agregar */}
              {mostrarFormMo && (
                <div className="px-5 py-4 flex gap-2 items-end border-b border-gray-100 bg-orange-50/40">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
                    <input
                      value={moDescripcion}
                      onChange={(e) => setMoDescripcion(e.target.value)}
                      placeholder="Ej: Cambio de aceite, Revisión de frenos..."
                      autoFocus
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div className="w-36">
                    <label className="text-xs text-gray-500 mb-1 block">Valor</label>
                    <input
                      type="text" inputMode="numeric"
                      value={moValor ? '$' + parseInt(moValor || '0', 10).toLocaleString('es-CO') : ''}
                      onChange={(e) => setMoValor(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmarAgregarMo() }}
                      placeholder="$0"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <button
                    onClick={confirmarAgregarMo}
                    disabled={!moListo || guardandoMo}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {guardandoMo ? (
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : 'Agregar'}
                  </button>
                  <button
                    onClick={() => { setMostrarFormMo(false); setMoDescripcion(''); setMoValor('') }}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {manoObraItems.length > 0 && (
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b bg-orange-50">
                      <th className="text-left py-2 px-4 font-medium">Descripción</th>
                      <th className="text-right py-2 px-4 font-medium w-24">Valor</th>
                      <th className="text-right py-2 px-4 font-medium w-24">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manoObraItems.map((item) => (
                      editingItem?.id === item.id ? (
                        <tr key={item.id} className="border-b bg-orange-50">
                          <td className="py-2 px-3">
                            <input
                              value={editingItem.descripcion}
                              onChange={(e) => setEditingItem({ ...editingItem, descripcion: e.target.value })}
                              autoFocus
                              className="w-full px-2 py-1.5 border border-orange-400 rounded-lg text-sm focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <PriceInput
                              value={editingItem.precio}
                              onChange={(v) => setEditingItem({ ...editingItem, precio: v, errMsg: '' })}
                              className={`w-full px-2 py-1.5 border rounded-lg text-sm font-mono text-right focus:outline-none ${editingItem.errMsg ? 'border-red-400' : 'border-orange-400'}`}
                            />
                            {editingItem.errMsg && <p className="text-xs text-red-500 mt-0.5 text-right">{editingItem.errMsg}</p>}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                              {celdaFecha(item)}
                              <div className="flex gap-0.5 flex-shrink-0">
                                <button onClick={handleEditItem} className="px-2 py-1 bg-orange-500 text-white rounded text-xs font-semibold">OK</button>
                                <button onClick={() => setEditingItem(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-800 truncate" title={item.descripcion}>{item.descripcion}</td>
                          <td className="py-3 px-4 text-right font-semibold">{formatCOP(item.precio_venta)}</td>
                          <td className="py-1.5 px-2">{accionesRepuesto(() => iniciarEditarItem(item), () => handleDeleteItem(item), celdaFecha(item))}</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}

            <div className="px-5 py-3 border-t text-sm font-semibold flex justify-between bg-orange-50">
              <span className="text-orange-700">Subtotal mano de obra</span>
              <span className="text-orange-900">{formatCOP(totalManoObra)}</span>
            </div>
          </div>
          </div>
          )}

          {/* ── TOTAL GENERAL ── */}
          <div className="bg-gray-900 rounded-xl px-5 py-4 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-300">
              <span>Repuestos</span>
              <span>{formatCOP(totalRepuestosLive)}</span>
            </div>
            {!esVenta && (
            <div className="flex justify-between text-sm text-gray-300">
              <span>Mano de obra</span>
              <span>{formatCOP(totalManoObraLive)}</span>
            </div>
            )}
            <div className="flex justify-between font-bold text-white text-base pt-1 border-t border-gray-700">
              <span>Total</span>
              <span>{formatCOP(totalLive)}</span>
            </div>
          </div>
        </div>

        {/* Columna derecha — Teléfono, Estado y Pago */}
        <div className="space-y-4">
          {/* Teléfono del cliente */}
          <div className={`bg-white rounded-xl border p-5 space-y-2 ${!telefono ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Teléfono cliente</h2>
              {!telefono && (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  ⚠ Falta
                </span>
              )}
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={formatTelefono(telefono)}
              onChange={(e) => setTelefono(soloDigitos(e.target.value))}
              onBlur={() => guardarCampoSidebar(
                { telefono: telefono || null },
                `Actualizó el teléfono de la orden #${orden.numero}`,
              )}
              onCopy={(e) => { e.preventDefault(); navigator.clipboard.writeText(telefono) }}
              placeholder="(310) 000-0000"
              maxLength={14}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono tracking-wide ${
                !telefono ? 'border-amber-300 bg-amber-50 placeholder-amber-400' : 'border-gray-200'
              }`}
            />
            {!telefono && (
              <p className="text-xs font-semibold text-amber-700">⚠ Falta el teléfono del cliente — agrégalo para poder contactarlo.</p>
            )}
          </div>

          {/* # Orden UMA — solo para órdenes UMA */}
          {esUMA && (() => {
            const noAplica = numerosOrdenUMA.includes('N/A')
            const numeros = numerosOrdenUMA.filter((n) => n !== 'N/A')
            const filled = noAplica || numeros.length > 0
            return (
              <div className={`bg-white rounded-xl border p-5 space-y-3 ${!filled ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900"># Orden UMA</h2>
                  {!filled && (
                    <span className="text-xs text-amber-600 font-medium">Requerido</span>
                  )}
                </div>

                {/* Chip "No aplica" cuando está seleccionado */}
                {noAplica && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5">
                      <span className="text-sm font-medium text-gray-700">No aplica</span>
                      <button
                        onClick={() => actualizarNumerosUMA((prev) => prev.filter((n) => n !== 'N/A'))}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Chips de números ingresados */}
                {numeros.length > 0 && (
                  <div className="space-y-1">
                    {numeros.map((num, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5">
                        <span className="font-mono text-sm font-semibold text-blue-800">{num}</span>
                        <button
                          onClick={() => actualizarNumerosUMA((prev) => prev.filter((n) => n !== num))}
                          className="text-blue-300 hover:text-red-500 transition-colors ml-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input + botón No aplica (ocultos cuando "No aplica" está activo) */}
                {!noAplica && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nuevoNumOrden}
                        onChange={(e) => setNuevoNumOrden(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && nuevoNumOrden.trim()) {
                            const num = nuevoNumOrden.trim()
                            if (!numerosOrdenUMA.includes(num)) actualizarNumerosUMA((prev) => [...prev, num])
                            setNuevoNumOrden('')
                          }
                        }}
                        placeholder="Ej: 349384"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <button
                        onClick={() => {
                          const num = nuevoNumOrden.trim()
                          if (!num || numerosOrdenUMA.includes(num)) return
                          actualizarNumerosUMA((prev) => [...prev, num])
                          setNuevoNumOrden('')
                        }}
                        disabled={!nuevoNumOrden.trim()}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                    <button
                      onClick={() => actualizarNumerosUMA((prev) => [...prev.filter((n) => n !== 'N/A'), 'N/A'])}
                      className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                    >
                      No aplica
                    </button>
                  </>
                )}

                {!filled && (
                  <p className="text-xs text-amber-600">Ingresa el número de orden UMA o selecciona "No aplica".</p>
                )}
              </div>
            )
          })()}

          {/* Pago consecutivo */}
          {(() => {
            const totalPagadoCliente = pagosOrden.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
            const servicioGuardado = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
            const lmTotal = lavaMotoOrdenes.reduce((s, r) => s + r.precio_venta_unitario * r.cantidad, 0)
            const totalAPagar = servicioGuardado + lmTotal
            const saldoPendiente = totalAPagar - totalPagadoCliente
            const estadoPagoCalc = calcularEstadoPago(pagosOrden, totalAPagar)
            const totalPagado = totalPagadoCliente
            const estadoColor = estadoPagoCalc === 'pagado' ? 'bg-green-100 text-green-700 border-green-200'
              : estadoPagoCalc === 'abono' ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-gray-100 text-gray-600 border-gray-200'
            const estadoLabel = estadoPagoCalc === 'pagado' ? 'Pago Finalizado'
              : estadoPagoCalc === 'abono' ? 'Abono parcial'
              : 'Pendiente de pago'
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Pagos</h2>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${estadoColor}`}>
                    {estadoLabel}
                  </span>
                </div>

                {/* Resumen */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Servicio técnico</span>
                    <span className="font-semibold text-gray-900">{formatCOP(servicioGuardado)}</span>
                  </div>
                  {lmTotal > 0 && (
                    <div className="flex justify-between text-xs text-cyan-600">
                      <span>Lava Moto ({lavaMotoOrdenes.reduce((s, r) => s + r.cantidad, 0)} und.)</span>
                      <span className="font-semibold">+ {formatCOP(lmTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1.5 text-gray-700">
                    <span>Total a pagar</span>
                    <span>{formatCOP(totalAPagar)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total pagado</span>
                    <span className="font-semibold text-green-700">{formatCOP(totalPagadoCliente)}</span>
                  </div>
                  {saldoPendiente > 0 && (
                    <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1.5">
                      <span className="text-red-600">Saldo pendiente</span>
                      <span className="text-red-600">{formatCOP(saldoPendiente)}</span>
                    </div>
                  )}
                </div>

                {/* Historial de pagos */}
                {pagosOrden.length > 0 && (
                  <div className="space-y-1.5">
                    {pagosOrden.map((pago, idx) => {
                      const esEgreso = pago.monto < 0
                      return (
                        <div key={pago.id} className={`flex items-center justify-between p-2.5 rounded-lg border group ${esEgreso ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {!esEgreso && <span className="text-xs font-semibold text-gray-500">#{pagosOrden.filter(p => p.monto > 0).indexOf(pago) + 1}</span>}
                              {esEgreso && <span className="text-xs font-semibold text-red-400">Egreso</span>}
                              <span className={`text-sm font-bold ${esEgreso ? 'text-red-700' : 'text-green-800'}`}>
                                {esEgreso ? '− ' : ''}{formatCOP(Math.abs(pago.monto))}
                              </span>
                              {pago.metodos_pago && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${esEgreso ? 'bg-white border border-red-200 text-red-600' : 'bg-white border border-green-200 text-green-700'}`}>
                                  {(pago.metodos_pago as { nombre: string }).nombre}
                                </span>
                              )}
                            </div>
                            {editandoPagoFechaId === pago.id ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <input
                                  type="datetime-local"
                                  value={pagoFechaInputValue}
                                  onChange={(e) => setPagoFechaInputValue(e.target.value)}
                                  className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 w-[148px]"
                                  autoFocus
                                />
                                <button onClick={handleGuardarFechaPago} disabled={savingPagoFecha} className="text-green-600 hover:text-green-800 p-0.5" title="Guardar">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                                <button onClick={() => setEditandoPagoFechaId(null)} disabled={savingPagoFecha} className="text-gray-400 hover:text-red-500 p-0.5" title="Cancelar">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                {new Date(pago.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} · {new Date(pago.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                {esGerencia && (
                                  <button onClick={() => abrirEditarFechaPago(pago)} className="text-gray-300 hover:text-purple-600 p-0.5" title="Editar fecha (gerencia)">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                )}
                              </p>
                            )}
                            {pago.notas && <p className={`text-xs italic mt-0.5 ${esEgreso ? 'text-red-400' : 'text-gray-500'}`}>{pago.notas}</p>}
                          </div>
                          <button
                            onClick={() => handleDeletePago(pago.id)}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 flex-shrink-0"
                            title="Eliminar movimiento"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Formulario nuevo pago / descuento */}
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-600">Registrar movimiento</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNuevoPagoSigno('positivo')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        nuevoPagoSigno === 'positivo' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'
                      }`}
                    >
                      + Pago
                    </button>
                    <button
                      type="button"
                      onClick={() => setNuevoPagoSigno('negativo')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        nuevoPagoSigno === 'negativo' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200'
                      }`}
                    >
                      − Descuento / Egreso
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nuevoPagoMonto ? '$' + parseInt(nuevoPagoMonto.replace(/\D/g, '') || '0', 10).toLocaleString('es-CO') : ''}
                    onChange={(e) => setNuevoPagoMonto(e.target.value.replace(/\D/g, ''))}
                    placeholder="Monto ($)"
                    className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 ${
                      nuevoPagoSigno === 'negativo' ? 'focus:ring-red-400' : 'focus:ring-green-400'
                    }`}
                  />
                  <select
                    value={nuevoPagoMetodo}
                    onChange={(e) => setNuevoPagoMetodo(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${!nuevoPagoMetodo ? 'border-gray-300 text-gray-400' : 'border-gray-200 text-gray-900'}`}
                  >
                    <option value="">Método de pago *</option>
                    {metodosPago.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                  <input
                    value={nuevoPagoNotas}
                    onChange={(e) => setNuevoPagoNotas(e.target.value)}
                    placeholder="Notas (opcional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={handleAddPago}
                    disabled={savingPago || !nuevoPagoMonto || !nuevoPagoMetodo}
                    className={`w-full py-2 px-3 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-semibold transition-colors ${
                      nuevoPagoSigno === 'negativo' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {savingPago ? 'Registrando...' : nuevoPagoSigno === 'negativo' ? '− Registrar descuento/egreso' : '+ Registrar pago'}
                  </button>
                  {pagoError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{pagoError}</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Pago a proveedor (terceros) */}
          {gestionaProveedor && (repuestosItems.some(i => i.origen === 'externo') || lavaMotoOrdenes.length > 0) && (
            <div className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Pago a proveedor</h2>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  proveedorPagadoCompleto
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : totalPagadoProveedor > 0
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}>
                  {proveedorPagadoCompleto ? 'Proveedor pagado' : totalPagadoProveedor > 0 ? 'Pago parcial' : 'Pendiente'}
                </span>
              </div>

              {/* Resumen */}
              <div className="bg-amber-50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Total a pagar al proveedor</span>
                  <span className="font-semibold text-gray-900">{formatCOP(totalCostoProveedorLive)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Total pagado</span>
                  <span className="font-semibold text-green-700">{formatCOP(totalPagadoProveedor)}</span>
                </div>
                {saldoPendienteProveedor > 0 && (
                  <div className="flex justify-between text-xs font-semibold border-t border-amber-200 pt-1.5">
                    <span className="text-red-600">Saldo pendiente proveedor</span>
                    <span className="text-red-600">{formatCOP(saldoPendienteProveedor)}</span>
                  </div>
                )}
              </div>

              {/* Historial de pagos a proveedor */}
              {pagosProveedor.length > 0 && (
                <div className="space-y-1.5">
                  {pagosProveedor.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-amber-50 border-amber-100 group">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-500">#{idx + 1}</span>
                          <span className="text-sm font-bold text-amber-800">{formatCOP(p.monto)}</span>
                          {p.metodos_pago && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-white border border-amber-200 text-amber-700">
                              {(p.metodos_pago as { nombre: string }).nombre}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(p.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{new Date(p.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                        {p.notas && <p className="text-xs italic text-gray-500 mt-0.5">{p.notas}</p>}
                      </div>
                      <button
                        onClick={() => handleDeletePagoProveedor(p.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 flex-shrink-0"
                        title="Eliminar pago"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulario nuevo pago a proveedor */}
              {!proveedorPagadoCompleto && (
                <div className="space-y-2 border-t border-amber-100 pt-3">
                  <p className="text-xs font-medium text-gray-600">Registrar pago a proveedor</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nuevoPagoProvMonto ? '$' + parseInt(nuevoPagoProvMonto.replace(/\D/g, '') || '0', 10).toLocaleString('es-CO') : ''}
                    onChange={(e) => setNuevoPagoProvMonto(e.target.value.replace(/\D/g, ''))}
                    placeholder="Monto ($)"
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <select
                    value={nuevoPagoProvMetodo}
                    onChange={(e) => setNuevoPagoProvMetodo(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${!nuevoPagoProvMetodo ? 'border-amber-200 text-gray-400' : 'border-amber-200 text-gray-900'}`}
                  >
                    <option value="">Método de pago *</option>
                    {metodosPago.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                  <input
                    value={nuevoPagoProvNotas}
                    onChange={(e) => setNuevoPagoProvNotas(e.target.value)}
                    placeholder="Notas (opcional)"
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={handleAddPagoProveedor}
                    disabled={savingPagosProv || !nuevoPagoProvMonto || !nuevoPagoProvMetodo}
                    className="w-full py-2 px-3 disabled:bg-gray-200 disabled:text-gray-400 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    {savingPagosProv ? 'Registrando...' : '+ Registrar pago a proveedor'}
                  </button>
                  {pagoProvError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{pagoProvError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notas internas */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
            <h2 className="font-semibold text-gray-900 text-sm">Notas internas</h2>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => guardarCampoSidebar(
                { notas: notas.trim() || null },
                `Actualizó las notas internas de la orden #${orden.numero}`,
              )}
              placeholder="Observaciones, recordatorios, detalles adicionales..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Estado */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Estado</h2>
            <div className="space-y-2">
              {([
                { value: 'programado', label: 'Programado' },
                { value: 'en_proceso', label: 'En proceso' },
                { value: 'pendiente', label: 'Pendiente' },
                { value: 'pagado', label: 'Pagado' },
                { value: 'listo', label: 'Finalizado' },
              ] as { value: EstadoOrden; label: string }[]).filter((s) => !esVenta || s.value !== 'programado').map((s) => {
                const tieneRepPendientes = s.value === 'listo' &&
                  items.some((i) => i.origen !== 'mano_obra' && i.estado_repuesto === 'pedido')
                const totalPagadoOrden = pagosOrden.filter((p) => p.monto > 0).reduce((sum, p) => sum + p.monto, 0)
                const lmTotalBtn = lavaMotoOrdenes.reduce((sum, r) => sum + r.precio_venta_unitario * r.cantidad, 0)
                const valorConLMBtn = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0) + lmTotalBtn
                const pagoIncompleto = s.value === 'listo' && totalPagadoOrden < valorConLMBtn
                const umaIncompleto = s.value === 'listo' && esUMA && numerosOrdenUMA.length === 0
                const pagadoBloqueado = s.value === 'pagado' && totalPagadoOrden < valorConLMBtn
                const proveedorIncompleto = s.value === 'listo' && gestionaProveedor && !proveedorPagadoCompleto && totalCostoProveedorLive > 0
                const bloqueado = tieneRepPendientes || pagoIncompleto || umaIncompleto || pagadoBloqueado || proveedorIncompleto
                const titleMsg = tieneRepPendientes
                  ? 'Hay repuestos marcados como Pedido que aún no han llegado'
                  : pagoIncompleto
                  ? `Saldo pendiente cliente: ${formatCOP(valorConLMBtn - totalPagadoOrden)}`
                  : proveedorIncompleto
                  ? `Saldo pendiente proveedor: ${formatCOP(saldoPendienteProveedor)}`
                  : umaIncompleto
                  ? 'Agrega el # de Orden UMA o selecciona "No aplica" antes de finalizar'
                  : pagadoBloqueado
                  ? `Saldo pendiente: ${formatCOP(valorConLMBtn - totalPagadoOrden)}`
                  : undefined
                return (
                  <button
                    key={s.value}
                    onClick={() => {
                      if (bloqueado) { alert(titleMsg ?? 'No se puede cambiar a este estado todavía.'); return }
                      cambiarEstado(s.value)
                    }}
                    title={titleMsg}
                    className={`w-full py-2 px-3 rounded-lg text-sm font-medium text-left transition-colors ${
                      bloqueado
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : estado === s.value
                          ? s.value === 'programado' ? 'bg-orange-500 text-white' : 'bg-blue-700 text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {s.label}
                    {s.value === 'pagado' && <span className="ml-1 text-xs opacity-60">(auto al pagar)</span>}
                    {tieneRepPendientes && <span className="ml-2 text-xs text-amber-400">⏳ rep. pendientes</span>}
                    {!tieneRepPendientes && pagoIncompleto && (
                      <span className="ml-2 text-xs text-red-300">saldo pendiente</span>
                    )}
                    {!tieneRepPendientes && !pagoIncompleto && proveedorIncompleto && (
                      <span className="ml-2 text-xs text-amber-400">⚠ proveedor pendiente</span>
                    )}
                    {!tieneRepPendientes && !pagoIncompleto && !proveedorIncompleto && umaIncompleto && (
                      <span className="ml-2 text-xs text-amber-400">⚠ # UMA</span>
                    )}
                    {pagadoBloqueado && (
                      <span className="ml-2 text-xs text-red-300">saldo pendiente</span>
                    )}
                  </button>
                )
              })}
            </div>
            {estado === 'programado' && (
              <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-orange-700 mb-1">Fecha y hora de la cita *</label>
                  <input
                    type="datetime-local"
                    value={fechaProgramada}
                    onChange={(e) => setFechaProgramada(e.target.value)}
                    onBlur={() => guardarCampoSidebar(
                      { fecha_programada: fechaProgramada ? new Date(fechaProgramada).toISOString() : null },
                      `Actualizó la fecha programada de la orden #${orden.numero}`,
                    )}
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
                    onBlur={() => guardarCampoSidebar(
                      { duracion_estimada_horas: duracionEstimada ? parseFloat(duracionEstimada) : null },
                      `Actualizó la duración estimada de la orden #${orden.numero}`,
                    )}
                    placeholder="Ej: 1.5"
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
            {estado === 'pendiente' && (
              <input
                value={motivoPendiente}
                onChange={(e) => setMotivoPendiente(e.target.value)}
                onBlur={() => guardarCampoSidebar(
                  { motivo_pendiente: motivoPendiente.trim() || null },
                  `Actualizó el motivo pendiente de la orden #${orden.numero}`,
                )}
                placeholder="Motivo pendiente *"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            )}
            {savedOk && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Guardado
              </div>
            )}
          </div>

          {/* Info mecánico */}
          {orden.usuarios && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              <span className="font-medium">Profesional: </span>{(orden.usuarios as { nombre: string }).nombre}
            </div>
          )}
        </div>
      </div>

      {/* Modal historial de cambios */}
      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={() => setShowAudit(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del panel */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="font-bold text-gray-900">Historial de cambios</h3>
                <p className="text-xs text-gray-400 mt-0.5">Orden #{orden.numero} · {orden.placa ?? '—'}</p>
              </div>
              <button
                onClick={() => setShowAudit(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Lista de entradas */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingAudit ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse border-l-2 border-gray-200 pl-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : auditLog.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Sin historial disponible</p>
                </div>
              ) : (
                auditLog.map((entry) => {
                  const diffs = entry.valor_anterior && entry.valor_nuevo
                    ? getDiff(entry.valor_anterior, entry.valor_nuevo)
                    : []
                  return (
                    <div key={entry.id} className="border-l-2 border-blue-200 pl-3 py-0.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-gray-800 font-medium leading-snug">
                          {entry.descripcion ?? entry.tipo}
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                          {formatAuditDate(entry.created_at)}
                        </span>
                      </div>
                      {diffs.map((d, i) => (
                        <p key={i} className="text-xs text-gray-500 leading-relaxed">
                          <span className="font-semibold text-gray-600">{d.field}:</span>{' '}
                          <span className="line-through text-red-400">{d.from}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="text-green-600 font-medium">{d.to}</span>
                        </p>
                      ))}
                      {entry.usuarios && (
                        <p className="text-xs text-gray-400">
                          por {(entry.usuarios as { nombre: string; email: string }).email}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>

    </>
  )
}
