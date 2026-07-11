'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConsultaRepuestos } from '@/components/ConsultaRepuestos'
import { ClienteMotoPanel } from '@/components/ClienteMotoPanel'
import { formatCOP, normalizarPlaca } from '@/lib/utils'
import { upsertMotoCliente } from '@/lib/clienteMoto'
import { registrarSalida, registrarDevolucion } from '@/lib/movimientos'
import { registrarAuditoria } from '@/lib/audit'
import type { ClienteMotoPanelResult } from '@/components/ClienteMotoPanel'

function soloDigitos(v: string) { return v.replace(/\D/g, '') }

function formatCelular(digits: string): string {
  const d = soloDigitos(digits).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface OrdenPlaca {
  id: string
  numero: number
  estado: string
  created_at: string
  tipo_orden: string
  valor_total: number
}

interface ItemOrden {
  id: string
  descripcion: string
  origen: 'uma' | 'externo' | 'insumo'
  cantidad: number
  costo: number
  precio_venta: number
  repuesto_uma_id: string | null
  repuesto_externo_id: string | null
  metodo_pago_id: string | null
  created_at: string
}

interface PagoOrden {
  id: string
  monto: number
  metodo_pago_id: string | null
  fecha: string
  notas: string | null
  metodos_pago: { nombre: string } | null
}

interface OrdenVenta {
  id: string
  numero: number
  cliente: string
  cedula: string | null
  celular: string | null
  placa: string | null
  tenant_id: string
  moto_id: string | null
  cliente_id: string | null
  created_at: string
}

type EstadoPago = 'pagado' | 'abono' | 'pendiente'

const DRAFT_KEY = 'optiDesk_venta_directa_draft'
const PANEL_INIT: ClienteMotoPanelResult = { motoId: null, clienteId: null, motoExtras: { marca: '', modelo: '', año: '', color: '', kilometraje: '' }, isKnownMoto: false }

function NuevaVentaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ordenId = searchParams.get('id')
  const { profile } = useAuth()
  const supabase = createClient()
  const esGerencia = profile?.rol === 'gerencia' || profile?.rol === 'dueno' || profile?.rol === 'control_total'

  // ─── Datos del cliente (creación y edición comparten estos campos) ───────
  const [cliente, setCliente] = useState('')
  const [cedula, setCedula] = useState('')
  const [celular, setCelular] = useState('')
  const [placa, setPlaca] = useState('')
  const [panelResult, setPanelResult] = useState<ClienteMotoPanelResult>(PANEL_INIT)

  // ─── Solo modo creación: historial de placa + borrador ───────────────────
  const [historialPlaca, setHistorialPlaca] = useState<OrdenPlaca[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const [creationDate, setCreationDate] = useState('')   // solo gerencia puede fijar fecha al crear
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Modo edición: la venta ya existe ─────────────────────────────────────
  const [orden, setOrden] = useState<OrdenVenta | null>(null)
  const [loadingOrden, setLoadingOrden] = useState(!!ordenId)
  const [items, setItems] = useState<ItemOrden[]>([])
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [pagosOrden, setPagosOrden] = useState<PagoOrden[]>([])
  const [savedOk, setSavedOk] = useState(false)
  const [deletingOrden, setDeletingOrden] = useState(false)

  // ─── Modal salida con saldo pendiente ────────────────────────────────────
  const [showSaldoModal, setShowSaldoModal] = useState(false)
  const [navTarget, setNavTarget] = useState<string | null>(null)
  const saldoPendienteRef = useRef(0)

  // Repuestos
  const [showAgregarRepuesto, setShowAgregarRepuesto] = useState(false)
  const [editingItem, setEditingItem] = useState<{ id: string; descripcion: string; costo: string; precio: string; metodo_pago_id: string } | null>(null)
  const [editandoItemFechaId, setEditandoItemFechaId] = useState<string | null>(null)
  const [itemFechaInputValue, setItemFechaInputValue] = useState('')
  const [savingItemFecha, setSavingItemFecha] = useState(false)

  // Pagos
  const [nuevoPagoMonto, setNuevoPagoMonto] = useState('')
  const [nuevoPagoMetodo, setNuevoPagoMetodo] = useState('')
  const [nuevoPagoNotas, setNuevoPagoNotas] = useState('')
  const [nuevoPagoSigno, setNuevoPagoSigno] = useState<'positivo' | 'negativo'>('positivo')
  const [savingPago, setSavingPago] = useState(false)
  const [pagoError, setPagoError] = useState('')
  const [editandoPagoFechaId, setEditandoPagoFechaId] = useState<string | null>(null)
  const [pagoFechaInputValue, setPagoFechaInputValue] = useState('')
  const [savingPagoFecha, setSavingPagoFecha] = useState(false)

  // Fecha de la orden (solo gerencia puede editar)
  const [editandoOrdenFecha, setEditandoOrdenFecha] = useState(false)
  const [ordenFechaInputValue, setOrdenFechaInputValue] = useState('')
  const [savingOrdenFecha, setSavingOrdenFecha] = useState(false)

  // ─── Borrador (solo en modo creación) ───────────────────
  useEffect(() => {
    if (ordenId) return
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const d = JSON.parse(saved)
        if (d.cliente) setCliente(d.cliente)
        if (d.cedula) setCedula(d.cedula)
        if (d.celular) setCelular(d.celular)
        if (d.placa) setPlaca(d.placa)
      }
    } catch { /* borrador inválido */ }
  }, [ordenId])

  useEffect(() => {
    if (ordenId) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ cliente, cedula, celular, placa }))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 1500)
    }, 800)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [ordenId, cliente, cedula, celular, placa])

  // ─── Cargar venta existente (modo edición) ──────────────
  const cargar = useCallback(async () => {
    if (!ordenId || !profile?.tenant_id) return
    const [{ data: o }, { data: i }, { data: mp }, { data: pg }] = await Promise.all([
      supabase.from('ordenes').select('id, numero, cliente, cedula, celular, placa, tenant_id, moto_id, cliente_id, created_at').eq('id', ordenId).single(),
      supabase.from('items_orden').select('id, descripcion, origen, cantidad, costo, precio_venta, repuesto_uma_id, repuesto_externo_id, metodo_pago_id, created_at').eq('orden_id', ordenId).neq('origen', 'mano_obra'),
      supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', profile.tenant_id).eq('activo', true),
      supabase.from('pagos_orden').select('id, monto, metodo_pago_id, fecha, notas, metodos_pago(nombre)').eq('orden_id', ordenId).order('fecha', { ascending: true }),
    ])
    if (o) {
      const ord = o as unknown as OrdenVenta
      setOrden(ord)
      setCliente(ord.cliente)
      setCedula(ord.cedula ?? '')
      setCelular(ord.celular ?? '')
      setPlaca(ord.placa ?? '')
    }
    setItems((i as unknown as ItemOrden[]) ?? [])
    setMetodosPago((mp as unknown as { id: string; nombre: string }[]) ?? [])
    setPagosOrden((pg as unknown as PagoOrden[]) ?? [])
    setLoadingOrden(false)
  }, [ordenId, profile?.tenant_id])

  useEffect(() => { if (ordenId) cargar() }, [ordenId, cargar])

  // Sincronizar ref de saldo para el beforeunload (sin triggear re-renders)
  useEffect(() => {
    const total = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    const pagado = pagosOrden.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
    saldoPendienteRef.current = total - pagado
  }, [items, pagosOrden])

  // Guard de cierre/recarga de pestaña cuando hay saldo pendiente
  useEffect(() => {
    if (!ordenId) return
    const handler = (e: BeforeUnloadEvent) => {
      if (saldoPendienteRef.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [ordenId])

  // ─── Historial de placa (solo modo creación) ──────────────────────────────
  const buscarHistorialPlaca = useCallback(async (placaNorm: string) => {
    if (!profile?.tenant_id || !placaNorm) {
      setHistorialPlaca([])
      return
    }
    setLoadingHistorial(true)
    const { data } = await supabase
      .from('ordenes')
      .select('id, numero, estado, tipo_orden, valor_total, created_at')
      .eq('tenant_id', profile.tenant_id)
      .eq('placa', placaNorm)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistorialPlaca((data as OrdenPlaca[]) ?? [])
    setLoadingHistorial(false)
  }, [profile?.tenant_id])

  useEffect(() => {
    if (ordenId) return
    if (placaTimer.current) clearTimeout(placaTimer.current)
    const norm = normalizarPlaca(placa)
    if (!norm) { setHistorialPlaca([]); return }
    placaTimer.current = setTimeout(() => buscarHistorialPlaca(norm), 600)
    return () => { if (placaTimer.current) clearTimeout(placaTimer.current) }
  }, [ordenId, placa, buscarHistorialPlaca])

  // ─── Crear la venta (modo creación) ──────────────
  const handleCrear = async () => {
    if (!cliente.trim()) {
      setError('Ingresa el nombre del cliente.')
      return
    }
    if (!profile?.tenant_id) return
    setError('')
    setCreando(true)
    try {
      const placaNorm = placa ? normalizarPlaca(placa) : null
      const { motoId, clienteId } = await upsertMotoCliente({
        supabase, tenantId: profile.tenant_id,
        placa: placaNorm, clienteNombre: cliente,
        cedula: cedula || null, celular: celular || null,
        motoId: panelResult.motoId, clienteId: panelResult.clienteId,
        motoExtras: panelResult.motoExtras,
      })

      const insertPayload: Record<string, unknown> = {
        tenant_id: profile.tenant_id,
        placa: placaNorm || null,
        cliente,
        cedula: cedula || null,
        celular: celular || null,
        telefono: celular || null,
        tipo_orden: 'venta_repuestos',
        estado: 'en_proceso',
        estado_pago: 'pendiente',
        valor_total: 0,
        valor_abono: 0,
        numero: 0,
        moto_id: motoId,
        cliente_id: clienteId,
      }
      if (esGerencia && creationDate) {
        insertPayload.created_at = new Date(creationDate).toISOString()
      }

      const { data: nuevaOrden, error: ordenErr } = await supabase
        .from('ordenes')
        .insert(insertPayload)
        .select('id')
        .single()

      if (ordenErr || !nuevaOrden) throw ordenErr ?? new Error('No se pudo crear la venta')
      const ordenData = nuevaOrden as { id: string }

      await registrarAuditoria(supabase, {
        tenant_id: profile.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenData.id,
        tipo: 'movimiento',
        valor_nuevo: { cliente },
        descripcion: `Inició una venta directa a "${cliente}"`,
        usuario_id: profile.id,
      })

      localStorage.removeItem(DRAFT_KEY)
      router.replace(`/admin/repuestos/nueva-venta?id=${ordenData.id}`)
    } catch (err: unknown) {
      const mensaje =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al guardar'
      setError(mensaje)
    } finally {
      setCreando(false)
    }
  }

  // ─── Datos del cliente — autoguardado por campo (modo edición) ───────────
  const guardarCampoCliente = async (campo: 'cliente' | 'cedula' | 'celular' | 'placa', valor: string) => {
    if (!orden || !ordenId) return
    const cambios: Record<string, unknown> = {}
    if (campo === 'placa') cambios.placa = valor ? normalizarPlaca(valor) : null
    else cambios[campo] = valor || null
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
      descripcion: `Actualizó ${campo} de la venta directa #${orden.numero}`,
      usuario_id: profile?.id,
    })
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 1500)
  }

  const handleDeleteOrden = async () => {
    if (!orden || !esGerencia) return
    if (!confirm(`¿Eliminar la venta directa #${orden.numero} de ${orden.cliente}? Esto borrará sus repuestos y pagos. Esta acción no se puede deshacer.`)) return
    setDeletingOrden(true)
    try {
      // Devolver al inventario los repuestos UMA
      for (const item of items) {
        if (!item.repuesto_uma_id) continue
        await registrarDevolucion(supabase, {
          tenantId: orden.tenant_id,
          repuesto_uma_id: item.repuesto_uma_id,
          cantidad: item.cantidad,
          costo_unitario: item.costo,
          precio_unitario: item.precio_venta,
          orden_id: ordenId as string,
          item_orden_id: item.id,
          registrado_por: profile?.id,
        })
      }
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenId as string,
        tipo: 'eliminacion',
        valor_anterior: orden as unknown as Record<string, unknown>,
        descripcion: `Gerencia eliminó la venta directa #${orden.numero} de ${orden.cliente}`,
        usuario_id: profile?.id,
      })
      // La cascada de DB se encarga de items_orden y pagos_orden
      await supabase.from('ordenes').delete().eq('id', ordenId as string)
      router.push('/admin/repuestos')
    } finally {
      setDeletingOrden(false)
    }
  }

  // ─── Repuestos ────────────────────────────────────────────
  const handleAddItem = async (item: {
    descripcion: string; origen: 'uma' | 'externo' | 'insumo'; repuesto_uma_id?: string;
    repuesto_externo_id?: string; cantidad: number; costo: number; precio_venta: number;
    metodo_pago_id?: string | null;
  }) => {
    if (!ordenId || !orden) return

    const { data, error: insError } = await supabase.from('items_orden').insert({
      orden_id: ordenId,
      ...item,
    }).select('*').single()
    if (insError) {
      alert(`No se pudo guardar "${item.descripcion}": ${insError.message}`)
      return
    }
    if (data) {
      const itemId = (data as { id: string }).id
      const nuevoTotal = [...items, data as unknown as ItemOrden].reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await Promise.all([
        supabase.from('ordenes').update({ valor_total: nuevoTotal }).eq('id', ordenId),
        registrarSalida(supabase, 'venta_directa', {
          tenantId: orden.tenant_id,
          repuesto_uma_id: item.repuesto_uma_id ?? null,
          repuesto_externo_id: item.repuesto_externo_id ?? null,
          cantidad: item.cantidad,
          costo_unitario: item.costo,
          precio_unitario: item.precio_venta,
          orden_id: ordenId,
          item_orden_id: itemId,
          registrado_por: profile?.id,
        }),
        registrarAuditoria(supabase, {
          tenant_id: orden.tenant_id,
          tabla: 'items_orden',
          registro_id: itemId,
          tipo: 'movimiento',
          descripcion: `Agregó repuesto "${item.descripcion}" (×${item.cantidad}) → $${(item.precio_venta * item.cantidad).toLocaleString('es-CO')} | venta directa #${orden.numero}`,
          usuario_id: profile?.id,
        }),
      ])
      await cargar()
    }
  }

  const handleDeleteItem = async (item: ItemOrden) => {
    if (!ordenId || !orden || !esGerencia) return
    if (!confirm(`¿Eliminar "${item.descripcion}"?`)) return
    await supabase.from('items_orden').delete().eq('id', item.id)
    const nuevoTotal = items.filter((i) => i.id !== item.id).reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    await supabase.from('ordenes').update({ valor_total: nuevoTotal }).eq('id', ordenId)
    await registrarDevolucion(supabase, {
      tenantId: orden.tenant_id,
      repuesto_uma_id: item.repuesto_uma_id ?? undefined,
      cantidad: item.cantidad,
      costo_unitario: item.costo,
      precio_unitario: item.precio_venta,
      orden_id: ordenId,
      item_orden_id: item.id,
      registrado_por: profile?.id,
    })
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'items_orden',
      registro_id: item.id,
      tipo: 'eliminacion',
      valor_anterior: item as unknown as Record<string, unknown>,
      descripcion: `Eliminó ítem "${item.descripcion}" de venta directa #${orden.numero}`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  const iniciarEditarItem = (item: ItemOrden) => setEditingItem({
    id: item.id,
    descripcion: item.descripcion,
    costo: String(item.costo),
    precio: String(item.precio_venta),
    metodo_pago_id: item.metodo_pago_id ?? '',
  })

  const actualizarItemRepuesto = async (id: string, cambios: Partial<{ descripcion: string; precio_venta: number; costo: number; metodo_pago_id: string | null }>) => {
    if (!orden) return
    const itemAnterior = items.find((i) => i.id === id)
    const { error: updError } = await supabase.from('items_orden').update(cambios).eq('id', id)
    if (updError) {
      alert(`No se pudo guardar el cambio: ${updError.message}`)
      return
    }
    const nuevoTotal = items.map((i) => i.id === id ? { ...i, ...cambios } : i).reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    await supabase.from('ordenes').update({ valor_total: nuevoTotal }).eq('id', ordenId as string)
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'items_orden',
      registro_id: id,
      tipo: 'edicion',
      valor_anterior: itemAnterior ? { descripcion: itemAnterior.descripcion, precio_venta: itemAnterior.precio_venta, costo: itemAnterior.costo, metodo_pago_id: itemAnterior.metodo_pago_id } : undefined,
      valor_nuevo: cambios,
      descripcion: `Editó repuesto "${cambios.descripcion ?? itemAnterior?.descripcion}" | venta directa #${orden.numero}`,
      usuario_id: profile?.id,
    })
  }

  const handleEditItem = async () => {
    if (!editingItem || !editingItem.descripcion.trim()) return
    const itemActual = items.find((i) => i.id === editingItem.id)
    const precio = parseInt(editingItem.precio.replace(/\D/g, ''), 10) || 0
    const costo = itemActual?.origen === 'externo' ? (parseInt(editingItem.costo.replace(/\D/g, ''), 10) || 0) : 0
    await actualizarItemRepuesto(editingItem.id, {
      descripcion: editingItem.descripcion.trim(),
      precio_venta: precio,
      costo,
      metodo_pago_id: itemActual?.origen === 'externo' ? (editingItem.metodo_pago_id || null) : null,
    })
    setEditingItem(null)
    await cargar()
  }

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
        descripcion: `Gerencia editó la fecha de un repuesto | venta directa #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoItemFechaId(null)
      await cargar()
    } finally {
      setSavingItemFecha(false)
    }
  }

  // Celda de fecha genérica (solo gerencia puede editarla)
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
          {esGerencia && (
            <button onClick={onEliminar} className="text-gray-500 hover:text-red-600 hover:bg-red-50 rounded p-1.5" title="Eliminar (gerencia)">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── Pagos ────────────────────────────────────────────
  const calcularEstadoPago = (pagos: PagoOrden[], valorTotal: number): EstadoPago => {
    const totalCliente = pagos.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
    if (totalCliente <= 0) return 'pendiente'
    if (totalCliente >= valorTotal) return 'pagado'
    return 'abono'
  }

  const handleAddPago = async () => {
    if (!orden || !ordenId) return
    const montoBase = parseInt(nuevoPagoMonto.replace(/\D/g, ''), 10)
    if (!montoBase) return
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
      const nuevosPagos = [...pagosOrden, { id: '', monto, metodo_pago_id: nuevoPagoMetodo || null, fecha: new Date().toISOString(), notas: nuevoPagoNotas || null, metodos_pago: null }]
      const totalItemsPago = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      const nuevoEstadoPago = calcularEstadoPago(nuevosPagos, totalItemsPago)
      const totalPagado = nuevosPagos.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
      const { error: ordUpdError } = await supabase.from('ordenes').update({
        estado_pago: nuevoEstadoPago,
        valor_abono: totalPagado,
        valor_total: totalItemsPago,
        metodo_pago_id: nuevoPagoMetodo || null,
        ...(nuevoEstadoPago === 'pagado' ? { estado: 'pagado' } : {}),
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
          descripcion: `${monto < 0 ? 'Registró descuento/egreso' : 'Registró pago'} ${formatCOP(Math.abs(monto))} | venta directa #${orden.numero}`,
          usuario_id: profile?.id,
        })
      }
      setNuevoPagoMonto('')
      setNuevoPagoMetodo('')
      setNuevoPagoNotas('')
      setNuevoPagoSigno('positivo')
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
    const totalItems = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    const nuevoEstadoPago = calcularEstadoPago(pagosRestantes, totalItems)
    const totalPagado = pagosRestantes.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
    await supabase.from('ordenes').update({
      estado_pago: nuevoEstadoPago,
      valor_abono: totalPagado,
      valor_total: totalItems,
    }).eq('id', orden.id)
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'pagos_orden',
      registro_id: pagoId,
      tipo: 'eliminacion',
      valor_anterior: pagoEliminado ? { monto: pagoEliminado.monto, metodo_pago_id: pagoEliminado.metodo_pago_id } : undefined,
      descripcion: `Eliminó pago de $${(pagoEliminado?.monto ?? 0).toLocaleString('es-CO')} | venta directa #${orden.numero}`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

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
        descripcion: `Gerencia editó la fecha de un pago | venta directa #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoPagoFechaId(null)
      await cargar()
    } finally {
      setSavingPagoFecha(false)
    }
  }

  const handleGuardarFechaOrden = async () => {
    if (!orden || !ordenFechaInputValue) return
    setSavingOrdenFecha(true)
    try {
      const nuevaFechaISO = new Date(ordenFechaInputValue).toISOString()
      await supabase.from('ordenes').update({ created_at: nuevaFechaISO }).eq('id', orden.id)
      await registrarAuditoria(supabase, {
        tenant_id: orden.tenant_id,
        tabla: 'ordenes',
        registro_id: orden.id,
        tipo: 'edicion',
        valor_anterior: { created_at: orden.created_at },
        valor_nuevo: { created_at: nuevaFechaISO },
        descripcion: `Gerencia editó la fecha de la venta directa #${orden.numero}`,
        usuario_id: profile?.id,
      })
      setEditandoOrdenFecha(false)
      await cargar()
    } finally {
      setSavingOrdenFecha(false)
    }
  }

  const placaNorm = placa ? normalizarPlaca(placa) : ''
  const ordenActiva = historialPlaca.find((o) => ['programado', 'falta_revision', 'en_proceso', 'pendiente'].includes(o.estado))

  const estadoColor: Record<string, string> = {
    programado: 'bg-orange-100 text-orange-700',
    falta_revision: 'bg-red-100 text-red-700',
    en_proceso: 'bg-blue-100 text-blue-700',
    pendiente: 'bg-amber-100 text-amber-700',
    listo: 'bg-green-100 text-green-700',
  }
  const estadoLabel: Record<string, string> = {
    programado: 'Programado',
    falta_revision: 'Falta revisión', en_proceso: 'En proceso', pendiente: 'Pendiente', listo: 'Cerrada',
  }

  const totalVenta = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalCostoProveedor = items.filter((i) => i.origen === 'externo').reduce((s, i) => s + i.costo * i.cantidad, 0)
  const totalPagadoCliente = pagosOrden.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0)
  const saldoPendiente = totalVenta - totalPagadoCliente

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (ordenId && saldoPendiente > 0) {
              setNavTarget('/admin/repuestos')
              setShowSaldoModal(true)
            } else {
              router.push('/admin/repuestos')
            }
          }}
          className="text-gray-400 hover:text-gray-600"
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {orden ? `Venta directa #${orden.numero}` : 'Nueva venta directa'}
        </h1>
        {!ordenId && draftSaved && <span className="text-xs text-green-600 ml-auto">Borrador guardado</span>}
        {ordenId && savedOk && <span className="text-xs text-green-600 ml-auto">Guardado</span>}
        {ordenId && orden && esGerencia && (
          <button
            onClick={handleDeleteOrden}
            disabled={deletingOrden}
            className="ml-auto p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Eliminar esta venta directa (solo gerencia)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {!ordenId ? (
        <>
          {/* Datos del cliente (modo creación) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Datos del cliente</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Nombre del cliente"
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={formatCelular(celular)}
                  onChange={(e) => setCelular(soloDigitos(e.target.value))}
                  onCopy={(e) => { e.preventDefault(); navigator.clipboard.writeText(celular) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono tracking-wide"
                  placeholder="(310) 000-0000"
                  maxLength={14}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Placa
                  <span className="ml-1 text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  className={`w-full px-3 py-2 border rounded-lg text-sm font-mono uppercase transition-colors ${
                    placaNorm && historialPlaca.length > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                  }`}
                  placeholder="ABC123"
                  maxLength={10}
                />
              </div>
            </div>

            {profile?.tenant_id && (
              <ClienteMotoPanel
                tenantId={profile.tenant_id}
                placa={placa}
                cedula={cedula}
                onAutoFill={({ nombre, celular: cel }) => {
                  if (nombre && !cliente) setCliente(nombre)
                  if (cel && !celular) setCelular(soloDigitos(cel))
                }}
                onResult={setPanelResult}
              />
            )}

            {placaNorm && (
              <div className={`rounded-xl p-4 space-y-2 border ${
                historialPlaca.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
              }`}>
                {loadingHistorial ? (
                  <p className="text-xs text-gray-500">Buscando historial de la placa...</p>
                ) : historialPlaca.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    Placa <span className="font-mono font-bold">{placaNorm}</span> sin historial previo en este taller. Esta venta iniciará su registro.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-blue-800 font-medium">
                      Esta venta quedará vinculada al historial de la moto <span className="font-mono">{placaNorm}</span>.
                    </p>
                    {ordenActiva && (
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-800 font-medium mb-1">⚠ Esta moto tiene un servicio técnico activo</p>
                        <a href={`/admin/ordenes/${ordenActiva.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900 underline">
                          Ir a la orden #{ordenActiva.numero} →
                        </a>
                      </div>
                    )}
                    <div className="mt-2 space-y-1">
                      {historialPlaca.slice(0, 5).map((o) => (
                        <a
                          key={o.id}
                          href={o.tipo_orden === 'venta_repuestos' ? `/admin/repuestos/nueva-venta?id=${o.id}` : `/admin/ordenes/${o.id}`}
                          className="flex items-center justify-between py-1.5 px-2 bg-white rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${o.tipo_orden === 'venta_repuestos' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {o.tipo_orden === 'venta_repuestos' ? 'Venta' : 'ST'}
                            </span>
                            <span className="text-xs text-gray-600">#{o.numero}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${estadoColor[o.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                              {estadoLabel[o.estado] ?? o.estado}
                            </span>
                            <span className="text-xs font-semibold text-gray-700">{formatCOP(o.valor_total)}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {esGerencia && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <label className="block text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">
                Fecha y hora de la venta
                <span className="ml-1.5 font-normal text-purple-500">(solo Gerencia)</span>
              </label>
              <input
                type="datetime-local"
                value={creationDate}
                onChange={(e) => setCreationDate(e.target.value)}
                className="px-3 py-2 border border-purple-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              {creationDate && (
                <p className="text-xs text-purple-600 mt-1">
                  La venta se registrará con fecha {new Date(creationDate).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
              {!creationDate && (
                <p className="text-xs text-purple-400 mt-1">Si no especificas fecha, se usa la fecha y hora actual.</p>
              )}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={handleCrear} loading={creando}>
            {`Crear venta${placaNorm ? ` — vincular a ${placaNorm}` : ''}`}
          </Button>
        </>
      ) : loadingOrden ? (
        <div className="space-y-5">
          <div className="h-6 bg-gray-100 rounded w-1/3 animate-pulse" />
          <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      ) : !orden ? (
        <p className="text-center text-gray-500 py-10">No se encontró esta venta.</p>
      ) : (
        <>
          {/* Datos del cliente (modo edición — autoguardado por campo) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-gray-900">Datos del cliente</h2>
              {esGerencia && orden.created_at && (
                <div className="flex items-center gap-2">
                  {editandoOrdenFecha ? (
                    <>
                      <input
                        type="datetime-local"
                        value={ordenFechaInputValue}
                        onChange={(e) => setOrdenFechaInputValue(e.target.value)}
                        className="text-xs border border-purple-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        autoFocus
                      />
                      <button
                        onClick={handleGuardarFechaOrden}
                        disabled={savingOrdenFecha}
                        className="text-green-600 hover:text-green-800 p-1"
                        title="Guardar fecha"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setEditandoOrdenFecha(false)}
                        disabled={savingOrdenFecha}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Cancelar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setOrdenFechaInputValue(isoToDatetimeLocal(orden.created_at))
                        setEditandoOrdenFecha(true)
                      }}
                      className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg px-2.5 py-1.5 transition-colors"
                      title="Editar fecha de la venta (solo gerencia)"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(orden.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  onBlur={() => guardarCampoCliente('cliente', cliente.trim())}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cédula</label>
                <input
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  onBlur={() => guardarCampoCliente('cedula', cedula.trim())}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={formatCelular(celular)}
                  onChange={(e) => setCelular(soloDigitos(e.target.value))}
                  onBlur={() => guardarCampoCliente('celular', celular)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono tracking-wide"
                  maxLength={14}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Placa</label>
                <input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  onBlur={() => guardarCampoCliente('placa', placa)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase"
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda — Repuestos + Total */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-xl border-2 border-blue-100 overflow-hidden">
                <div className="bg-blue-600 px-5 py-3.5">
                  <h2 className="text-white font-bold text-base">Agregar repuestos</h2>
                </div>
                <div className="bg-white">
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

                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="text-[11px] text-gray-500 uppercase border-b bg-blue-50">
                        <th className="text-left py-1 px-2 font-medium w-28">Origen / Ref.</th>
                        <th className="text-left py-1 px-2 font-medium">Descripción</th>
                        <th className="text-left py-1 px-2 font-medium w-24 hidden sm:table-cell">Método prov.</th>
                        <th className="text-right py-1 px-2 font-medium w-20 hidden sm:table-cell">Costo</th>
                        <th className="text-right py-1 px-2 font-medium w-20">P. venta</th>
                        <th className="text-right py-1 px-2 font-medium w-24">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-xs text-gray-400">Sin repuestos agregados todavía.</td></tr>
                      )}
                      {items.map((item) => {
                        const tipoLabel = item.origen === 'uma' ? 'UMA' : 'Externo'
                        const tipoColor = item.origen === 'uma' ? 'blue' : 'amber'
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
                                className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none"
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
                                <input
                                  type="text" inputMode="numeric"
                                  value={editingItem.costo ? '$' + parseInt(editingItem.costo.replace(/\D/g, '') || '0', 10).toLocaleString('es-CO') : ''}
                                  onChange={(e) => setEditingItem({ ...editingItem, costo: e.target.value.replace(/\D/g, '') })}
                                  className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm font-mono text-right focus:outline-none"
                                />
                              ) : <span className="text-gray-300 block text-center">—</span>}
                            </td>
                            <td className="py-1 px-2">
                              <input
                                type="text" inputMode="numeric"
                                value={editingItem.precio ? '$' + parseInt(editingItem.precio.replace(/\D/g, '') || '0', 10).toLocaleString('es-CO') : ''}
                                onChange={(e) => setEditingItem({ ...editingItem, precio: e.target.value.replace(/\D/g, '') })}
                                className="w-full px-2 py-1 border border-blue-300 rounded-lg text-sm font-mono text-right focus:outline-none"
                              />
                            </td>
                            <td className="py-1 px-2">
                              <div className="flex flex-col items-end gap-0.5">
                                {celdaFecha(item)}
                                <div className="flex gap-0.5 flex-shrink-0">
                                  <button onClick={handleEditItem} className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold">OK</button>
                                  <button onClick={() => setEditingItem(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.id} className="border-b hover:bg-gray-50">
                            <td className="py-1.5 px-2">
                              <div className="flex flex-col gap-0.5">
                                <Badge variant={tipoColor}>{tipoLabel}</Badge>
                                {refCode !== '—' && <span className="text-xs font-mono font-semibold text-gray-600 leading-none">{refCode}</span>}
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-gray-800 truncate" title={descClean}>{descClean}</td>
                            <td className="py-1.5 px-2 text-gray-500 text-xs hidden sm:table-cell">{item.origen === 'externo' ? (metodosPago.find((m) => m.id === item.metodo_pago_id)?.nombre ?? '—') : '—'}</td>
                            <td className="py-1.5 px-2 text-right text-gray-500 whitespace-nowrap hidden sm:table-cell">{item.origen === 'externo' ? formatCOP(item.costo) : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-semibold whitespace-nowrap">{formatCOP(item.precio_venta)}</td>
                            <td className="py-1.5 px-2">{accionesRepuesto(() => iniciarEditarItem(item), () => handleDeleteItem(item), celdaFecha(item))}</td>
                          </tr>
                        )
                      })}
                      {saldoPendiente < 0 && orden && (
                        <tr className="border-b bg-amber-50">
                          <td className="py-1.5 px-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-200 text-amber-800 whitespace-nowrap">
                              Excedente
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-amber-800 text-sm font-medium truncate">
                            {orden.cliente} — saldo a favor
                          </td>
                          <td className="py-1.5 px-2 hidden sm:table-cell" />
                          <td className="py-1.5 px-2 hidden sm:table-cell" />
                          <td className="py-1.5 px-2 text-right font-bold text-amber-700 whitespace-nowrap">
                            {formatCOP(-saldoPendiente)}
                          </td>
                          <td className="py-1.5 px-2" />
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <div className="px-5 py-3 border-t space-y-1 text-sm font-semibold bg-blue-50">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total costo proveedor</span>
                      <span className="text-gray-900">{formatCOP(totalCostoProveedor)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Total precio venta cliente</span>
                      <span className="text-blue-900">{formatCOP(totalVenta)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-blue-100">
                      {saldoPendiente > 0 ? (
                        <>
                          <span className="text-red-600">Saldo pendiente</span>
                          <span className="text-red-600">{formatCOP(saldoPendiente)}</span>
                        </>
                      ) : saldoPendiente < 0 ? (
                        <>
                          <span className="text-amber-600">Excedente en caja</span>
                          <span className="text-amber-600">{formatCOP(-saldoPendiente)}</span>
                        </>
                      ) : (
                        <>
                          <span />
                          <Badge variant="green">Pagado</Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {profile?.tenant_id && (
                <ConsultaRepuestos
                  open={showAgregarRepuesto}
                  onClose={() => setShowAgregarRepuesto(false)}
                  tenantId={profile.tenant_id}
                  onAdd={handleAddItem}
                />
              )}

              {/* TOTAL */}
              <div className="bg-gray-900 rounded-xl px-5 py-4 space-y-1.5">
                <div className="flex justify-between font-bold text-white text-base">
                  <span>Total</span>
                  <span>{formatCOP(totalVenta)}</span>
                </div>
              </div>
            </div>

            {/* Columna derecha — Pagos y egresos */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Pagos</h2>
                  {saldoPendiente > 0 ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-red-100 text-red-700 border-red-200">
                      Saldo pendiente
                    </span>
                  ) : saldoPendiente < 0 ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                      Excedente
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-green-100 text-green-700 border-green-200">
                      Pagado
                    </span>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total a pagar</span>
                    <span className="font-semibold text-gray-900">{formatCOP(totalVenta)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Total pagado</span>
                    <span className="font-semibold text-green-700">{formatCOP(totalPagadoCliente)}</span>
                  </div>
                  {saldoPendiente !== 0 && (
                    <div className="flex justify-between text-xs font-semibold border-t border-gray-200 pt-1.5">
                      <span className={saldoPendiente > 0 ? 'text-red-600' : 'text-amber-600'}>
                        {saldoPendiente > 0 ? 'Saldo pendiente' : 'Excedente a favor'}
                      </span>
                      <span className={saldoPendiente > 0 ? 'text-red-600' : 'text-amber-600'}>
                        {formatCOP(Math.abs(saldoPendiente))}
                      </span>
                    </div>
                  )}
                </div>

                {pagosOrden.length > 0 && (
                  <div className="space-y-1.5">
                    {pagosOrden.map((pago) => {
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
            </div>
          </div>
        </>
      )}

      {/* Modal: salida con saldo pendiente */}
      {showSaldoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="bg-red-50 px-5 py-4 flex items-start gap-3 border-b border-red-100">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Venta sin pago completo</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Quedan <span className="font-bold text-red-600">{formatCOP(saldoPendiente)}</span> pendientes de cobro.
                </p>
              </div>
            </div>
            <div className="p-5 space-y-2.5">
              <button
                onClick={() => setShowSaldoModal(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                Registrar Pagos
              </button>
              <button
                onClick={() => {
                  setShowSaldoModal(false)
                  if (navTarget) router.push(navTarget)
                }}
                className="w-full py-2.5 bg-white border-2 border-red-400 text-red-600 hover:bg-red-50 rounded-xl text-sm font-bold transition-colors"
              >
                Dejar en pago pendiente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NuevaVentaPage() {
  return (
    <Suspense>
      <NuevaVentaContent />
    </Suspense>
  )
}
