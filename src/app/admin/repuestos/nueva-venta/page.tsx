'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ClienteMotoPanel } from '@/components/ClienteMotoPanel'
import { formatCOP, normalizarPlaca } from '@/lib/utils'
import { upsertMotoCliente } from '@/lib/clienteMoto'
import { registrarSalida, registrarDevolucion } from '@/lib/movimientos'
import { registrarAuditoria } from '@/lib/audit'
import type { ClienteMotoPanelResult } from '@/components/ClienteMotoPanel'

interface ItemVenta {
  id?: string
  descripcion: string
  origen: 'uma' | 'externo' | 'insumo'
  repuesto_uma_id?: string
  repuesto_externo_id?: string
  cantidad: number
  costo: number
  precio_venta: number
  metodo_pago_id?: string | null
}

function soloDigitos(v: string) { return v.replace(/\D/g, '') }

function formatCelular(digits: string): string {
  const d = soloDigitos(digits).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

interface OrdenPlaca {
  id: string
  numero: number
  estado: string
  created_at: string
  tipo_orden: string
  valor_total: number
}

const DRAFT_KEY = 'optiDesk_venta_directa_draft'
const PANEL_INIT: ClienteMotoPanelResult = { motoId: null, clienteId: null, motoExtras: { marca: '', modelo: '', año: '', color: '' }, isKnownMoto: false }

function NuevaVentaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const { profile } = useAuth()
  const supabase = createClient()

  const [cliente, setCliente] = useState('')
  const [cedula, setCedula] = useState('')
  const [celular, setCelular] = useState('')
  const [placa, setPlaca] = useState('')
  const [panelResult, setPanelResult] = useState<ClienteMotoPanelResult>(PANEL_INIT)

  // Historial de la placa
  const [historialPlaca, setHistorialPlaca] = useState<OrdenPlaca[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const [originalItems, setOriginalItems] = useState<ItemVenta[]>([])
  // Repuestos — una fila UMA y una fila Externo, igual de simple que en Servicio Técnico:
  // sin catálogo ni botón de agregar, solo descripción (opcional, con valor predeterminado).
  const UMA_DESC_DEFAULT = 'Repuesto UMA'
  const EXT_DESC_DEFAULT = 'Repuesto externo'
  const [umaSlot, setUmaSlot] = useState<{ id?: string; desc: string; valor: string }>({ desc: UMA_DESC_DEFAULT, valor: '' })
  const [extSlot, setExtSlot] = useState<{ id?: string; desc: string; costo: string; valor: string; metodo: string }>({ desc: EXT_DESC_DEFAULT, costo: '', valor: '', metodo: '' })
  // true mientras se está escribiendo/editando la fila; al perder el foco se "asienta" en
  // vista de solo lectura con lápiz/papelera, igual que en Servicio Técnico.
  const [umaEditando, setUmaEditando] = useState(false)
  const [extEditando, setExtEditando] = useState(false)

  const [pagado, setPagado] = useState(true)
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [metodoPagoId, setMetodoPagoId] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(!!editId)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Borrador (solo en modo creación) ───────────────────
  useEffect(() => {
    if (editId) return
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
  }, [editId])

  useEffect(() => {
    if (editId) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ cliente, cedula, celular, placa }))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 1500)
    }, 800)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [editId, cliente, cedula, celular, placa])

  // ─── Cargar venta existente (modo edición) ──────────────
  useEffect(() => {
    if (!editId) return
    let activo = true
    ;(async () => {
      const [{ data: orden }, { data: itemsData }] = await Promise.all([
        supabase.from('ordenes').select('cliente, cedula, celular, placa, estado_pago, metodo_pago_id, moto_id, cliente_id').eq('id', editId).single(),
        supabase.from('items_orden').select('id, descripcion, origen, repuesto_uma_id, repuesto_externo_id, cantidad, costo, precio_venta, metodo_pago_id').eq('orden_id', editId),
      ])
      if (!activo) return
      if (orden) {
        const o = orden as { cliente: string; cedula: string | null; celular: string | null; placa: string | null; estado_pago: string | null; metodo_pago_id: string | null; moto_id: string | null; cliente_id: string | null }
        setCliente(o.cliente ?? '')
        setCedula(o.cedula ?? '')
        setCelular(o.celular ?? '')
        setPlaca(o.placa ?? '')
        setPagado(o.estado_pago !== 'pendiente')
        setMetodoPagoId(o.metodo_pago_id ?? '')
        setPanelResult({ motoId: o.moto_id, clienteId: o.cliente_id, motoExtras: { marca: '', modelo: '', año: '', color: '' }, isKnownMoto: !!o.moto_id })
      }
      const loadedItems = ((itemsData as ItemVenta[]) ?? []).filter((i) => i.origen === 'uma' || i.origen === 'externo')
      setOriginalItems(loadedItems)
      const umaIt = loadedItems.find((i) => i.origen === 'uma')
      const extIt = loadedItems.find((i) => i.origen === 'externo')
      if (umaIt) setUmaSlot({ id: umaIt.id, desc: umaIt.descripcion, valor: String(umaIt.precio_venta) })
      if (extIt) setExtSlot({ id: extIt.id, desc: extIt.descripcion, costo: String(extIt.costo), valor: String(extIt.precio_venta), metodo: extIt.metodo_pago_id ?? '' })
      setLoadingEdit(false)
    })()
    return () => { activo = false }
  }, [editId])

  // ─── Historial de placa ──────────────────────────────────
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

  // Debounce la búsqueda de placa
  useEffect(() => {
    if (placaTimer.current) clearTimeout(placaTimer.current)
    const norm = normalizarPlaca(placa)
    if (!norm) { setHistorialPlaca([]); return }
    placaTimer.current = setTimeout(() => buscarHistorialPlaca(norm), 600)
    return () => { if (placaTimer.current) clearTimeout(placaTimer.current) }
  }, [placa, buscarHistorialPlaca])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', profile.tenant_id).eq('activo', true)
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
  }, [profile?.tenant_id])

  const umaListo = !!umaSlot.valor
  const extListo = !!extSlot.valor && !!extSlot.metodo
  const items: ItemVenta[] = []
  if (umaListo) {
    items.push({
      id: umaSlot.id,
      descripcion: umaSlot.desc.trim() || 'Repuesto UMA',
      origen: 'uma',
      cantidad: 1,
      costo: 0,
      precio_venta: parseInt(umaSlot.valor.replace(/\D/g, ''), 10),
    })
  }
  if (extListo) {
    items.push({
      id: extSlot.id,
      descripcion: extSlot.desc.trim() || 'Repuesto externo',
      origen: 'externo',
      cantidad: 1,
      costo: parseInt(extSlot.costo.replace(/\D/g, '') || '0', 10),
      precio_venta: parseInt(extSlot.valor.replace(/\D/g, ''), 10),
      metodo_pago_id: extSlot.metodo,
    })
  }

  const handleGuardar = async () => {
    const faltantes: string[] = []
    if (!cliente.trim()) faltantes.push('nombre del cliente')
    if (items.length === 0) faltantes.push('al menos un repuesto')
    if (pagado && !metodoPagoId) faltantes.push('método de pago')
    if (faltantes.length > 0) {
      setError(`Faltan datos obligatorios: ${faltantes.join(', ')}.`)
      return
    }
    if (!profile?.tenant_id) return
    setError('')
    setSaving(true)
    try {
      const total = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      const estadoPago = pagado ? 'pagado' : 'pendiente'
      const valorAbonoNum = pagado ? total : 0
      const placaNorm = placa ? normalizarPlaca(placa) : null

      // Registrar moto y cliente si hay datos suficientes
      const { motoId, clienteId } = await upsertMotoCliente({
        supabase, tenantId: profile.tenant_id,
        placa: placaNorm, clienteNombre: cliente,
        cedula: cedula || null, celular: celular || null,
        motoId: panelResult.motoId, clienteId: panelResult.clienteId,
        motoExtras: panelResult.motoExtras,
      })

      if (editId) {
        // ─── Modo edición: reconciliar ítems primero, y solo si todo sale bien
        // actualizar el total/abono de la orden — así un insert de ítems fallido
        // nunca deja la orden con un abono que no corresponde a ningún ítem real.
        const removidos = originalItems.filter((orig) => !items.some((i) => i.id === orig.id))
        const agregados = items.filter((i) => !i.id)

        if (removidos.length > 0) {
          await supabase.from('items_orden').delete().in('id', removidos.map((i) => i.id as string))
          await Promise.all(
            removidos.map((item) =>
              registrarDevolucion(supabase, {
                tenantId: profile.tenant_id,
                repuesto_uma_id: item.repuesto_uma_id ?? null,
                repuesto_externo_id: item.repuesto_externo_id ?? null,
                cantidad: item.cantidad,
                costo_unitario: item.costo,
                precio_unitario: item.precio_venta,
                orden_id: editId,
                registrado_por: profile.id,
              })
            )
          )
        }

        if (agregados.length > 0) {
          const { error: insErr } = await supabase.from('items_orden').insert(
            agregados.map((item) => ({
              orden_id: editId,
              descripcion: item.descripcion,
              origen: item.origen,
              repuesto_uma_id: item.repuesto_uma_id ?? null,
              repuesto_externo_id: item.repuesto_externo_id ?? null,
              cantidad: item.cantidad,
              costo: item.costo,
              precio_venta: item.precio_venta,
              metodo_pago_id: item.metodo_pago_id ?? null,
            }))
          )
          if (insErr) throw insErr
          await Promise.all(
            agregados.map((item) =>
              registrarSalida(supabase, 'venta_directa', {
                tenantId: profile.tenant_id,
                repuesto_uma_id: item.repuesto_uma_id ?? null,
                repuesto_externo_id: item.repuesto_externo_id ?? null,
                cantidad: item.cantidad,
                costo_unitario: item.costo,
                precio_unitario: item.precio_venta,
                orden_id: editId,
                registrado_por: profile.id,
              })
            )
          )
        }

        // El total/abono se guarda solo después de que los ítems ya quedaron
        // reconciliados con éxito en items_orden.
        const { error: updErr } = await supabase.from('ordenes').update({
          placa: placaNorm || null,
          cliente,
          cedula: cedula || null,
          celular: celular || null,
          estado_pago: estadoPago,
          valor_total: total,
          valor_abono: valorAbonoNum,
          metodo_pago_id: metodoPagoId || null,
          moto_id: motoId,
          cliente_id: clienteId,
        }).eq('id', editId)
        if (updErr) throw updErr

        await registrarAuditoria(supabase, {
          tenant_id: profile.tenant_id,
          tabla: 'ordenes',
          registro_id: editId,
          tipo: 'edicion',
          valor_nuevo: { cliente, total, cantidad_items: items.length },
          descripcion: `Editó venta directa de "${cliente}" — ${items.length} ítem${items.length !== 1 ? 's' : ''}, ${formatCOP(total)}`,
          usuario_id: profile.id,
        })

        router.push('/admin/repuestos')
        return
      }

      const { data: orden, error: ordenErr } = await supabase
        .from('ordenes')
        .insert({
          tenant_id: profile.tenant_id,
          placa: placaNorm || null,
          cliente,
          cedula: cedula || null,
          celular: celular || null,
          tipo_orden: 'venta_repuestos',
          estado: 'listo',
          estado_pago: estadoPago,
          valor_total: total,
          valor_abono: valorAbonoNum,
          metodo_pago_id: metodoPagoId || null,
          numero: 0,
          moto_id: motoId,
          cliente_id: clienteId,
        })
        .select('id')
        .single()

      if (ordenErr || !orden) throw ordenErr ?? new Error('No se pudo crear la venta')
      const ordenData = orden as { id: string }

      const { error: itemsErr } = await supabase.from('items_orden').insert(
        items.map((item) => ({
          orden_id: ordenData.id,
          descripcion: item.descripcion,
          origen: item.origen,
          repuesto_uma_id: item.repuesto_uma_id ?? null,
          repuesto_externo_id: item.repuesto_externo_id ?? null,
          cantidad: item.cantidad,
          costo: item.costo,
          precio_venta: item.precio_venta,
          metodo_pago_id: item.metodo_pago_id ?? null,
        }))
      )
      if (itemsErr) {
        // Si los ítems no se guardaron, la orden no puede quedar registrando un
        // total/abono que no corresponde a ningún ítem real (la "venta fantasma"
        // que aparece en Caja sin nada que la respalde). Se revierte la orden y
        // se avisa para que el usuario reintente — no queda ningún dato a medias.
        await supabase.from('ordenes').delete().eq('id', ordenData.id)
        throw itemsErr
      }

      // Registrar salidas en inventario y decrementar stock UMA
      await Promise.all(
        items.map((item) =>
          registrarSalida(supabase, 'venta_directa', {
            tenantId: profile.tenant_id,
            repuesto_uma_id: item.repuesto_uma_id ?? null,
            repuesto_externo_id: item.repuesto_externo_id ?? null,
            cantidad: item.cantidad,
            costo_unitario: item.costo,
            precio_unitario: item.precio_venta,
            orden_id: ordenData.id,
            registrado_por: profile.id,
          })
        )
      )

      await registrarAuditoria(supabase, {
        tenant_id: profile.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenData.id,
        tipo: 'movimiento',
        valor_nuevo: { cliente, total, cantidad_items: items.length },
        descripcion: `Registró venta directa a "${cliente}" — ${items.length} ítem${items.length !== 1 ? 's' : ''}, ${formatCOP(total)}`,
        usuario_id: profile.id,
      })

      localStorage.removeItem(DRAFT_KEY)
      router.push('/admin/repuestos')
    } catch (err: unknown) {
      const mensaje =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al guardar'
      setError(mensaje)
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
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

  if (loadingEdit) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="h-6 bg-gray-100 rounded w-1/3 animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">{editId ? 'Editar venta directa' : 'Nueva venta directa'}</h1>
        {draftSaved && <span className="text-xs text-green-600 ml-auto">Borrador guardado</span>}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Datos del cliente */}
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

          {/* ─── Placa con vinculación ─── */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Placa
              <span className="ml-1 text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-mono uppercase transition-colors ${
                placaNorm && historialPlaca.length > 0
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200'
              }`}
              placeholder="ABC123"
              maxLength={10}
            />
          </div>
        </div>

        {/* Panel inteligente moto + cliente */}
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

        {/* Panel de historial de placa */}
        {placaNorm && (
          <div className={`rounded-xl p-4 space-y-2 border ${
            historialPlaca.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
          }`}>
            {loadingHistorial ? (
              <p className="text-xs text-gray-500">Buscando historial de la placa...</p>
            ) : historialPlaca.length === 0 ? (
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500">
                  Placa <span className="font-mono font-bold">{placaNorm}</span> sin historial previo en este taller. Esta venta iniciará su registro.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <p className="text-xs text-blue-800 font-medium">
                    Esta venta quedará vinculada al historial de la moto <span className="font-mono">{placaNorm}</span>.
                    Se verá junto a sus servicios técnicos en Servicio Técnico y en Repuestos.
                  </p>
                </div>

                {/* Orden activa — alerta */}
                {ordenActiva && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 font-medium mb-1">
                      ⚠ Esta moto tiene un servicio técnico activo
                    </p>
                    <p className="text-xs text-amber-700 mb-2">
                      ¿Quieres agregar estos repuestos directamente a la orden #{ordenActiva.numero} en lugar de crear una venta separada?
                    </p>
                    <Link
                      href={`/admin/ordenes/${ordenActiva.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900 underline"
                    >
                      Ir a la orden #{ordenActiva.numero} →
                    </Link>
                  </div>
                )}

                {/* Historial resumido */}
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-blue-700 font-medium">Historial de {placaNorm}:</p>
                  {historialPlaca.slice(0, 5).map((o) => (
                    <Link
                      key={o.id}
                      href={o.tipo_orden === 'venta_repuestos' ? `/admin/repuestos` : `/admin/ordenes/${o.id}`}
                      className="flex items-center justify-between py-1.5 px-2 bg-white rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${o.tipo_orden === 'venta_repuestos' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {o.tipo_orden === 'venta_repuestos' ? 'Venta' : 'ST'}
                        </span>
                        <span className="text-xs text-gray-600">#{o.numero}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${estadoColor[o.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {estadoLabel[o.estado] ?? o.estado}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">{formatCOP(o.valor_total)}</span>
                      </div>
                    </Link>
                  ))}
                  {historialPlaca.length > 5 && (
                    <p className="text-xs text-blue-600 text-center pt-1">+{historialPlaca.length - 5} más en el historial</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Repuestos</h2>
        <div>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase border-b">
                <th className="text-left py-1 px-1 font-medium w-[13%]">Origen</th>
                <th className="text-left py-1 px-1 font-medium w-[27%]">Descripción</th>
                <th className="text-left py-1 px-1 font-medium w-[20%]">Método</th>
                <th className="text-right py-1 px-1 font-medium w-[17%]">Costo prov.</th>
                <th className="text-right py-1 px-1 font-medium w-[17%]">Venta</th>
                <th className="py-1 px-1 w-[6%]" />
              </tr>
            </thead>
            <tbody>
              {/* UMA */}
              <tr className="border-b">
                <td className="py-1 px-1"><Badge variant="blue">UMA</Badge></td>
                {umaListo && !umaEditando ? (
                  <>
                    <td className={`py-1 px-1 truncate ${umaSlot.desc.trim() === UMA_DESC_DEFAULT ? 'text-gray-400' : 'text-gray-800'}`}>{umaSlot.desc.trim() || UMA_DESC_DEFAULT}</td>
                    <td className="py-1 px-1 text-center text-gray-300">—</td>
                    <td className="py-1 px-1 text-center text-gray-300">—</td>
                    <td className="py-1 px-1 text-right font-semibold truncate">{formatCOP(parseInt(umaSlot.valor.replace(/\D/g, '') || '0', 10))}</td>
                    <td className="py-1 px-1">
                      <div className="flex gap-0.5 justify-end">
                        <button onClick={() => setUmaEditando(true)} className="text-gray-400 hover:text-blue-600 p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => { setUmaSlot({ desc: UMA_DESC_DEFAULT, valor: '' }); setUmaEditando(false) }} className="text-gray-400 hover:text-red-500 p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1 px-1">
                      <input
                        value={umaSlot.desc}
                        onChange={(e) => setUmaSlot((q) => ({ ...q, desc: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => setUmaEditando(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className={`w-full px-1.5 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${umaSlot.desc === UMA_DESC_DEFAULT ? 'text-gray-400' : 'text-gray-900'}`}
                      />
                    </td>
                    <td className="py-1 px-1 text-center text-gray-300">—</td>
                    <td className="py-1 px-1 text-center text-gray-300">—</td>
                    <td className="py-1 px-1">
                      <input
                        type="text" inputMode="numeric"
                        value={umaSlot.valor ? '$' + parseInt(umaSlot.valor || '0', 10).toLocaleString('es-CO') : ''}
                        onChange={(e) => setUmaSlot((q) => ({ ...q, valor: e.target.value.replace(/\D/g, '') }))}
                        onBlur={() => setUmaEditando(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        placeholder="$"
                        className="w-full px-1.5 py-1 border border-gray-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </td>
                    <td className="py-1 px-1" />
                  </>
                )}
              </tr>

              {/* Externo */}
              <tr className="border-b">
                <td className="py-1 px-1"><Badge variant="amber">Externo</Badge></td>
                {extListo && !extEditando ? (
                  <>
                    <td className={`py-1 px-1 truncate ${extSlot.desc.trim() === EXT_DESC_DEFAULT ? 'text-gray-400' : 'text-gray-800'}`}>{extSlot.desc.trim() || EXT_DESC_DEFAULT}</td>
                    <td className="py-1 px-1 text-gray-500 truncate">{metodosPago.find((m) => m.id === extSlot.metodo)?.nombre ?? '—'}</td>
                    <td className="py-1 px-1 text-right text-gray-500 truncate">{formatCOP(parseInt(extSlot.costo.replace(/\D/g, '') || '0', 10))}</td>
                    <td className="py-1 px-1 text-right font-semibold truncate">{formatCOP(parseInt(extSlot.valor.replace(/\D/g, '') || '0', 10))}</td>
                    <td className="py-1 px-1">
                      <div className="flex gap-0.5 justify-end">
                        <button onClick={() => setExtEditando(true)} className="text-gray-400 hover:text-blue-600 p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => { setExtSlot({ desc: EXT_DESC_DEFAULT, costo: '', valor: '', metodo: '' }); setExtEditando(false) }} className="text-gray-400 hover:text-red-500 p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1 px-1">
                      <input
                        value={extSlot.desc}
                        onChange={(e) => setExtSlot((q) => ({ ...q, desc: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => setExtEditando(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className={`w-full px-1.5 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${extSlot.desc === EXT_DESC_DEFAULT ? 'text-gray-400' : 'text-gray-900'}`}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <select
                        value={extSlot.metodo}
                        onChange={(e) => setExtSlot((q) => ({ ...q, metodo: e.target.value }))}
                        onBlur={() => setExtEditando(false)}
                        className="w-full px-1 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      >
                        <option value="">—</option>
                        {metodosPago.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="text" inputMode="numeric"
                        value={extSlot.costo ? '$' + parseInt(extSlot.costo || '0', 10).toLocaleString('es-CO') : ''}
                        onChange={(e) => setExtSlot((q) => ({ ...q, costo: e.target.value.replace(/\D/g, '') }))}
                        onBlur={() => setExtEditando(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        placeholder="$"
                        className="w-full px-1.5 py-1 border border-gray-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="text" inputMode="numeric"
                        value={extSlot.valor ? '$' + parseInt(extSlot.valor || '0', 10).toLocaleString('es-CO') : ''}
                        onChange={(e) => setExtSlot((q) => ({ ...q, valor: e.target.value.replace(/\D/g, '') }))}
                        onBlur={() => setExtEditando(false)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        placeholder="$"
                        className="w-full px-1.5 py-1 border border-gray-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </td>
                    <td className="py-1 px-1" />
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pago */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Pago</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPagado(true)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors border-2 ${
              pagado ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}
          >
            ✓ Se realizó el pago
          </button>
          <button
            type="button"
            onClick={() => setPagado(false)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors border-2 ${
              !pagado ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
            }`}
          >
            Queda pendiente
          </button>
        </div>
        {pagado && (
          <select
            value={metodoPagoId}
            onChange={(e) => setMetodoPagoId(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm ${!metodoPagoId ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
          >
            <option value="">Seleccionar método de pago *</option>
            {metodosPago.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        )}
        {!pagado && (
          <p className="text-xs text-red-500 font-medium">Esta venta quedará registrada como pago pendiente.</p>
        )}
      </div>

      {/* Total */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
        <span className="text-xl font-bold text-gray-900">{formatCOP(total)}</span>
      </div>

      <Button className="w-full" size="lg" onClick={handleGuardar} loading={saving}>
        {editId ? 'Guardar cambios' : `Registrar venta${placaNorm ? ` — vincular a ${placaNorm}` : ''}`}
      </Button>
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
