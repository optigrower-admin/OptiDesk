'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────
type Vista = 'lista' | 'calendario'
type Filtro = 'todas' | 'pendientes' | 'completadas'

type ClienteResumen = {
  id: string
  nombre: string | null
  celular: string | null
  cedula: string | null
  placa: string | null
  numero_factura: string | null
  assigned_to: string | null
  etapa_venta: string | null
  moto: string | null
}

type Actividad = {
  id: string
  descripcion: string
  fecha: string
  completado: boolean
  clienteId: string
  clienteNombre: string
  clienteCelular: string | null
  clienteCedula: string | null
  clientePlaca: string | null
  clienteFactura: string | null
  clienteMoto: string | null
  asignadoId: string | null
  asignadoNombre: string | null
}

type UsuarioSimple = { id: string; nombre: string | null }

interface Props {
  tenantId: string
  usuarioId: string
  rol: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtDia(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}
function soloFecha(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function hoy() { return soloFecha(new Date().toISOString()) }
function estaSemanaDe(iso: string) {
  const d = new Date(iso); const h = new Date()
  const diff = (d.getTime() - h.getTime()) / 86400000
  return diff >= 0 && diff < 7
}
function esVencida(iso: string) {
  return soloFecha(iso) < hoy()
}
// Etiqueta de "días que faltan" — lo más importante para leer la lista de un vistazo.
function diasRestantes(iso: string, completado: boolean): { texto: string; cls: string } {
  const dias = Math.round((new Date(soloFecha(iso) + 'T12:00:00').getTime() - new Date(hoy() + 'T12:00:00').getTime()) / 86400000)
  if (completado) return { texto: '✓ Hecha', cls: 'bg-gray-100 text-gray-500' }
  if (dias < 0) return { texto: `⏰ Vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`, cls: 'bg-red-600 text-white' }
  if (dias === 0) return { texto: '🔴 Hoy', cls: 'bg-orange-500 text-white' }
  if (dias === 1) return { texto: '🟡 Mañana', cls: 'bg-amber-100 text-amber-700' }
  if (dias <= 7)  return { texto: `🔵 En ${dias} días`, cls: 'bg-blue-100 text-blue-700' }
  return { texto: `📅 En ${dias} días`, cls: 'bg-gray-100 text-gray-600' }
}

// ─── Pequeño CalendarioMes ─────────────────────────────────────────────────────
function CalendarioMes({
  anio, mes, actividadesPorDia, diaSeleccionado, onSelectDia,
}: {
  anio: number; mes: number; actividadesPorDia: Map<string, Actividad[]>
  diaSeleccionado: string | null; onSelectDia: (d: string | null) => void
}) {
  const primerDia = new Date(anio, mes, 1).getDay() // 0=Dom
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const celdas: (number | null)[] = Array(primerDia).fill(null)
  for (let i = 1; i <= diasEnMes; i++) celdas.push(i)
  while (celdas.length % 7 !== 0) celdas.push(null)

  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {diasSemana.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {celdas.map((dia, idx) => {
          if (!dia) return <div key={idx} className="bg-white h-16 sm:h-20" />
          const key = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const acts = actividadesPorDia.get(key) ?? []
          const isHoy = key === hoy()
          const isSel = key === diaSeleccionado
          const pendientes = acts.filter(a => !a.completado)
          const completadas = acts.filter(a => a.completado)
          return (
            <button
              key={idx}
              onClick={() => onSelectDia(isSel ? null : key)}
              className={`bg-white h-16 sm:h-20 flex flex-col items-start p-1 sm:p-1.5 text-left transition-colors hover:bg-blue-50 relative ${
                isSel ? 'ring-2 ring-inset ring-blue-500' : ''
              }`}
            >
              <span className={`text-xs font-semibold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                isHoy ? 'bg-blue-600 text-white' : 'text-gray-700'
              }`}>
                {dia}
              </span>
              <div className="flex flex-col gap-0.5 w-full min-w-0">
                {pendientes.length > 0 && (
                  <div className="text-[10px] leading-tight bg-orange-100 text-orange-700 rounded px-1 font-medium truncate">
                    {pendientes.length} pend.
                  </div>
                )}
                {completadas.length > 0 && (
                  <div className="text-[10px] leading-tight bg-green-100 text-green-700 rounded px-1 font-medium truncate">
                    {completadas.length} hecha{completadas.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Fila de actividad ─────────────────────────────────────────────────────────
function FilaActividad({
  act, onToggle, saving,
}: {
  act: Actividad; onToggle: (a: Actividad) => void; saving: boolean
}) {
  const vencida = act.fecha && !act.completado && esVencida(act.fecha)
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
      act.completado
        ? 'bg-gray-50 border-gray-100'
        : vencida
          ? 'bg-red-50 border-red-200'
          : 'bg-white border-gray-200'
    }`}>
      <button
        onClick={() => onToggle(act)}
        disabled={saving}
        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          act.completado
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-blue-500'
        }`}
      >
        {act.completado && (
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <a
              href={`/admin/ventas?abrir=${act.clienteId}`}
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              {act.clienteNombre}
            </a>
            {act.asignadoNombre && (
              <span className="ml-2 text-xs text-gray-500">· {act.asignadoNombre}</span>
            )}
          </div>
          {act.fecha ? (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${diasRestantes(act.fecha, act.completado).cls}`}>
              {diasRestantes(act.fecha, act.completado).texto}
            </span>
          ) : (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              act.completado ? 'bg-gray-100 text-gray-500' : 'bg-purple-100 text-purple-700'
            }`}>
              {act.completado ? '✓ Hecho' : '✅ Sin fecha'}
            </span>
          )}
        </div>

        <p className={`text-sm mt-0.5 ${act.completado ? 'line-through text-gray-400' : 'text-gray-700'}`}>
          {act.descripcion}
        </p>

        {act.fecha && (
          <p className={`text-xs mt-0.5 font-medium ${
            act.completado ? 'text-gray-400' : vencida ? 'text-red-600' : 'text-gray-500'
          }`}>
            {fmtFecha(act.fecha)}
          </p>
        )}

        <div className="flex gap-2 mt-0.5 flex-wrap">
          {act.clienteMoto && (
            <span className="text-[10px] text-gray-400">{act.clienteMoto}</span>
          )}
          {act.clientePlaca && (
            <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-mono">
              {act.clientePlaca.toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Principal ────────────────────────────────────────────────────────────────
export default function ActividadesClient({ tenantId, usuarioId, rol }: Props) {
  const supabase = createClient()
  const rolNorm = (rol ?? '').toLowerCase().replace('ñ', 'n')
  const esPrivilegiado = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'

  const [actividades, setActividades] = useState<Actividad[]>([])
  const [usuariosEquipo, setUsuariosEquipo] = useState<UsuarioSimple[]>([])
  const [visibilidadMap, setVisibilidadMap] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<Vista>('lista')
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  // Solo para gerencia/dueño/control_total: filtrar por asesor asignado o por
  // visualización compartida de cualquier usuario. Los demás roles siempre ven
  // únicamente lo suyo (asignado + compartido con ellos), acotado ya en la consulta.
  const [asignadoFiltro, setAsignadoFiltro] = useState<Set<string>>(new Set())
  const [visibleFiltro, setVisibleFiltro] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const [saving, setSaving] = useState(false)

  // Calendario
  const ahora = new Date()
  const [mesVista, setMesVista] = useState(ahora.getMonth())
  const [anioVista, setAnioVista] = useState(ahora.getFullYear())
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)

    // 1. Clientes en seguimiento (acotado a los propios + los que tenga visibilidad, salvo roles gerenciales)
    let clientesQuery = supabase
      .from('clientes')
      .select(`
        id, nombre, celular, cedula, placa, numero_factura, assigned_to, etapa_venta,
        clientes_motos_interes(motos_catalogo(referencia))
      `)
      .eq('tenant_id', tenantId)
      .eq('en_seguimiento_ventas', true)

    if (!esPrivilegiado) {
      const { data: compartidos } = await supabase
        .from('clientes_visibilidad').select('cliente_id').eq('usuario_id', usuarioId)
      const idsCompartidos = (compartidos ?? []).map(c => c.cliente_id)
      clientesQuery = idsCompartidos.length > 0
        ? clientesQuery.or(`assigned_to.eq.${usuarioId},id.in.(${idsCompartidos.join(',')})`)
        : clientesQuery.eq('assigned_to', usuarioId)
    }

    const { data: clientes } = await clientesQuery

    if (!clientes || clientes.length === 0) { setActividades([]); setVisibilidadMap({}); setLoading(false); return }

    // 2. Usuarios para nombres de asesores (y para los selectores de Asignado/Visualización de gerencia)
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('tenant_id', tenantId)

    const usuarioMap = new Map((usuarios ?? []).map(u => [u.id as string, u.nombre as string]))
    setUsuariosEquipo((usuarios ?? []).map(u => ({ id: u.id as string, nombre: u.nombre as string | null })))

    const clienteMap = new Map<string, ClienteResumen>()
    for (const c of clientes) {
      const misInt = Array.isArray(c.clientes_motos_interes) ? c.clientes_motos_interes : []
      const primerInt = misInt[0]
      const mc = primerInt ? (Array.isArray(primerInt.motos_catalogo) ? primerInt.motos_catalogo[0] : primerInt.motos_catalogo) : null
      clienteMap.set(c.id as string, {
        id: c.id as string,
        nombre: c.nombre as string | null,
        celular: c.celular as string | null,
        cedula: c.cedula as string | null,
        placa: c.placa as string | null,
        numero_factura: c.numero_factura as string | null,
        assigned_to: c.assigned_to as string | null,
        etapa_venta: c.etapa_venta as string | null,
        moto: (mc as { referencia?: string } | null)?.referencia ?? null,
      })
    }

    const ids = [...clienteMap.keys()]

    // 3. Recordatorios (agenda) y visibilidad compartida por cliente, en paralelo.
    // Los "pasos" legados (clientes_pasos, sin fecha) ya no se crean desde la ficha
    // — todo lo nuevo pasa por recordatorios, que siempre exige fecha — así que no
    // se muestran aquí para no ensuciar la agenda con pendientes sin fecha.
    const [{ data: recs }, { data: vis }] = await Promise.all([
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, completado, cliente_id')
        .in('cliente_id', ids)
        .order('fecha_recordatorio', { ascending: true }),
      supabase.from('clientes_visibilidad')
        .select('cliente_id, usuario_id')
        .in('cliente_id', ids),
    ])

    const visMap: Record<string, string[]> = {}
    for (const v of vis ?? []) {
      const cid = v.cliente_id as string
      if (!visMap[cid]) visMap[cid] = []
      visMap[cid].push(v.usuario_id as string)
    }
    setVisibilidadMap(visMap)

    // El "asesor" de una acción es el asesor del CLIENTE (clientes.assigned_to), no
    // necesariamente quien creó/registró el recordatorio (recordatorios.asignado_a) —
    // por ejemplo, Gerencia puede anotar un recordatorio para un cliente de otro asesor.
    // El resumen diario notifica según este mismo criterio.
    const actsRec: Actividad[] = (recs ?? []).map(r => {
      const c = clienteMap.get(r.cliente_id as string)
      const asignadoRecId = c?.assigned_to ?? null
      return {
        id: `rec-${r.id}`,
        descripcion: r.nota ?? '(sin nota)',
        fecha: r.fecha_recordatorio as string,
        completado: !!r.completado,
        clienteId: r.cliente_id as string,
        clienteNombre: c?.nombre ?? 'Cliente',
        clienteCelular: c?.celular ?? null,
        clienteCedula: c?.cedula ?? null,
        clientePlaca: c?.placa ?? null,
        clienteFactura: c?.numero_factura ?? null,
        clienteMoto: c?.moto ?? null,
        asignadoId: asignadoRecId,
        asignadoNombre: asignadoRecId ? (usuarioMap.get(asignadoRecId) ?? null) : null,
      }
    })

    setActividades(actsRec)
    setLoading(false)
  }, [tenantId, supabase, usuarioId, esPrivilegiado])

  useEffect(() => { cargar() }, [cargar])

  async function toggleActividad(act: Actividad) {
    setSaving(true)
    const nuevoEstado = !act.completado
    const rawId = act.id.replace(/^rec-/, '')

    await supabase.from('recordatorios').update({
      completado: nuevoEstado,
      completado_at: nuevoEstado ? new Date().toISOString() : null,
    }).eq('id', rawId)
    // Sincronizar proxima_accion en el cliente
    if (nuevoEstado) {
      const { data: prox } = await supabase.from('recordatorios')
        .select('nota, fecha_recordatorio')
        .eq('cliente_id', act.clienteId).eq('completado', false)
        .order('fecha_recordatorio', { ascending: true }).limit(1).maybeSingle()
      await supabase.from('clientes').update({
        proxima_accion: prox?.nota ?? null,
        proxima_accion_fecha: prox?.fecha_recordatorio ?? null,
      }).eq('id', act.clienteId)
    }

    setActividades(prev => prev.map(a => a.id === act.id ? { ...a, completado: nuevoEstado } : a))
    setSaving(false)
  }

  function toggleAsignado(id: string) {
    setAsignadoFiltro(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleVisible(id: string) {
    setVisibleFiltro(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ─── Búsqueda y filtro ────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    let lista = actividades
    if (filtro === 'pendientes') lista = lista.filter(a => !a.completado)
    if (filtro === 'completadas') lista = lista.filter(a => a.completado)
    if (esPrivilegiado) {
      if (asignadoFiltro.size > 0) {
        lista = lista.filter(a => !!a.asignadoId && asignadoFiltro.has(a.asignadoId))
      }
      if (visibleFiltro.size > 0) {
        // El asesor asignado siempre "ve" su propio cliente, además de quienes
        // tengan visualización compartida explícita (clientes_visibilidad).
        lista = lista.filter(a =>
          (!!a.asignadoId && visibleFiltro.has(a.asignadoId)) ||
          (visibilidadMap[a.clienteId]?.some(id => visibleFiltro.has(id)) ?? false)
        )
      }
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      lista = lista.filter(a =>
        a.clienteNombre.toLowerCase().includes(q) ||
        a.clienteCelular?.includes(q) ||
        a.clienteCedula?.includes(q) ||
        a.clienteMoto?.toLowerCase().includes(q) ||
        a.clientePlaca?.toLowerCase().includes(q) ||
        a.clienteFactura?.toLowerCase().includes(q) ||
        a.descripcion.toLowerCase().includes(q)
      )
    }
    return lista
  }, [actividades, filtro, esPrivilegiado, asignadoFiltro, visibleFiltro, visibilidadMap, busqueda])

  // ─── Lista agrupada ────────────────────────────────────────────────────────
  // "Vencidas" siempre se muestra primero, incluso vacía (con un mensaje de
  // ánimo) — es lo más urgente y el usuario debe verlo de un vistazo sin tener
  // que buscarlo. El resto de grupos solo aparece si tiene actividades.
  const grupos = useMemo(() => {
    const vencidas = filtradas.filter(a => !a.completado && esVencida(a.fecha))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    const hoyActs = filtradas.filter(a => !a.completado && soloFecha(a.fecha) === hoy())
    const semana = filtradas.filter(a => !a.completado && soloFecha(a.fecha) > hoy() && estaSemanaDe(a.fecha))
    const despues = filtradas.filter(a => !a.completado && soloFecha(a.fecha) > hoy() && !estaSemanaDe(a.fecha))
    const completadas = filtradas.filter(a => a.completado)
    const out = [
      { label: '⏰ Vencidas', items: vencidas, accent: 'text-red-600', siempreVisible: filtro !== 'completadas' },
      { label: '📅 Hoy', items: hoyActs, accent: 'text-blue-700', siempreVisible: false },
      { label: '📆 Esta semana', items: semana, accent: 'text-indigo-600', siempreVisible: false },
      { label: '🗓 Más adelante', items: despues, accent: 'text-gray-600', siempreVisible: false },
      { label: '✓ Completadas', items: completadas, accent: 'text-gray-400', siempreVisible: false },
    ]
    return out.filter(g => g.items.length > 0 || g.siempreVisible)
  }, [filtradas, filtro])

  // ─── Calendario: actividades por día ──────────────────────────────────────
  const actividadesPorDia = useMemo(() => {
    const map = new Map<string, Actividad[]>()
    for (const a of filtradas) {
      const key = soloFecha(a.fecha)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return map
  }, [filtradas])

  const actsDiaSeleccionado = diaSeleccionado ? (actividadesPorDia.get(diaSeleccionado) ?? []) : []

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  function prevMes() {
    if (mesVista === 0) { setMesVista(11); setAnioVista(y => y - 1) }
    else setMesVista(m => m - 1)
    setDiaSeleccionado(null)
  }
  function nextMes() {
    if (mesVista === 11) { setMesVista(0); setAnioVista(y => y + 1) }
    else setMesVista(m => m + 1)
    setDiaSeleccionado(null)
  }

  const pendientesTotal = actividades.filter(a => !a.completado).length
  const vencidasTotal = actividades.filter(a => !a.completado && a.fecha && esVencida(a.fecha)).length

  return (
    <div className="p-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Seguimiento de Actividades</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendientesTotal} pendiente{pendientesTotal !== 1 ? 's' : ''}
            {vencidasTotal > 0 && (
              <span className="ml-2 text-red-600 font-medium">· ⏰ {vencidasTotal} vencida{vencidasTotal !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>

        {/* Toggle vista */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {([
            { id: 'lista', label: 'Lista' },
            { id: 'calendario', label: 'Calendario' },
          ] as { id: Vista; label: string }[]).map(v => (
            <button
              key={v.id}
              onClick={() => setVista(v.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                vista === v.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Buscador + filtro */}
      <div className="flex gap-3 mb-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, cédula, celular, moto, placa o factura..."
            className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
              ×
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {([
            { id: 'pendientes', label: 'Pendientes' },
            { id: 'todas', label: 'Todas' },
            { id: 'completadas', label: 'Realizadas' },
          ] as { id: Filtro; label: string }[]).map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                filtro === f.id
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asignado / Visualización — gerencia y dueño ven todo y pueden filtrar
          por cualquier persona; el resto de roles siempre ve solo lo suyo. */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        {esPrivilegiado ? (
          <>
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Asignado a:</span>
              <button
                onClick={() => setAsignadoFiltro(new Set())}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  asignadoFiltro.size === 0
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                }`}>
                Todos
              </button>
              {usuariosEquipo.map(u => (
                <button
                  key={u.id}
                  onClick={() => toggleAsignado(u.id)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    asignadoFiltro.has(u.id)
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                  }`}>
                  {u.nombre ?? 'Usuario'}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Visualización:</span>
              <button
                onClick={() => setVisibleFiltro(new Set())}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  visibleFiltro.size === 0
                    ? 'bg-purple-700 text-white border-purple-700'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-purple-400'
                }`}>
                Todos
              </button>
              {usuariosEquipo.map(u => (
                <button
                  key={u.id}
                  onClick={() => toggleVisible(u.id)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    visibleFiltro.has(u.id)
                      ? 'bg-purple-700 text-white border-purple-700'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-purple-400'
                  }`}>
                  {u.nombre ?? 'Usuario'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            onClick={() => { setAsignadoFiltro(new Set()); setVisibleFiltro(new Set()) }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border bg-purple-50 text-purple-700 border-purple-200"
          >
            👤 Mis asignados y mis visualizaciones
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm">Cargando actividades...</div>
      )}

      {!loading && filtradas.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {busqueda.trim()
            ? 'Sin resultados para esa búsqueda.'
            : filtro === 'pendientes' ? '¡Estás al día! 🎊 No tienes actividades pendientes.' : 'Sin actividades.'}
        </div>
      )}

      {/* ── LISTA ── */}
      {!loading && vista === 'lista' && filtradas.length > 0 && (
        <div className="space-y-6">
          {grupos.map(g => (
            <div key={g.label}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${g.accent}`}>{g.label}</p>
              {g.items.length === 0 ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 font-semibold text-center">
                  ¡Estás al día! 🎊
                </p>
              ) : (
                <div className="space-y-2">
                  {g.items.map(act => (
                    <FilaActividad key={act.id} act={act} onToggle={toggleActividad} saving={saving} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CALENDARIO ── */}
      {!loading && vista === 'calendario' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
          <div>
            {/* Nav mes */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMes} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="font-semibold text-gray-800">
                {MESES[mesVista]} {anioVista}
              </h2>
              <button onClick={nextMes} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <CalendarioMes
              anio={anioVista}
              mes={mesVista}
              actividadesPorDia={actividadesPorDia}
              diaSeleccionado={diaSeleccionado}
              onSelectDia={setDiaSeleccionado}
            />
          </div>

          {/* Panel lateral del día */}
          <div>
            {diaSeleccionado ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800 capitalize">
                    {fmtDia(diaSeleccionado + 'T12:00:00')}
                  </p>
                  <button onClick={() => setDiaSeleccionado(null)}
                    className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </div>
                {actsDiaSeleccionado.length === 0 ? (
                  <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-6 text-center">
                    Sin actividades este día
                  </p>
                ) : (
                  <div className="space-y-2">
                    {actsDiaSeleccionado.map(act => (
                      <FilaActividad key={act.id} act={act} onToggle={toggleActividad} saving={saving} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl px-6 py-10 text-center">
                <p className="text-gray-400 text-sm">Selecciona un día para ver sus actividades</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
