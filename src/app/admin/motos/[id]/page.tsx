'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

// ── Types ──────────────────────────────────────────────────────────────────
type Moto = {
  id: string; placa: string; marca: string | null; modelo: string | null
  año: number | null; color: string | null; kilometraje: number | null; notas: string | null
  cliente_id: string | null
  clientes: { id: string; nombre: string; celular: string | null } | null
  created_at: string
}
type Orden = {
  id: string; numero: number; estado: string; tipo_orden: string | null
  valor_total: number; created_at: string; descripcion_problema: string | null
  cliente: string | null
}
type Propietario = {
  id: string; fecha_desde: string; fecha_hasta: string | null; notas: string | null
  clientes: { id: string; nombre: string; celular: string | null } | null
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtCorta(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' })
}
function mesesEntre(desde: string, hasta: string | null) {
  const fin   = hasta ? new Date(hasta) : new Date()
  const ini   = new Date(desde)
  const meses = Math.round((fin.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (meses < 2) return `${Math.max(1, meses)} mes`
  if (meses < 24) return `${meses} meses`
  return `${Math.round(meses / 12)} años`
}

const ESTADO_COLOR: Record<string, string> = {
  falta_revision: 'bg-red-100 text-red-700', en_proceso: 'bg-blue-100 text-blue-700',
  pendiente: 'bg-amber-100 text-amber-700',  listo: 'bg-green-100 text-green-700',
}
const ESTADO_LABEL: Record<string, string> = {
  falta_revision: 'Falta rev.', en_proceso: 'En proceso', pendiente: 'Pendiente', listo: 'Cerrada',
}

type Tab = 'servicio' | 'propietarios'

// ── Modal buscar cliente ────────────────────────────────────────────────────
function CambiarPropietarioModal({
  tenantId, motoId, motoPlaca, onDone, onCancel,
}: {
  tenantId: string; motoId: string; motoPlaca: string
  onDone: () => void; onCancel: () => void
}) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busqueda, setBusqueda]       = useState('')
  const [resultados, setResultados]   = useState<{ id: string; nombre: string; celular: string | null }[]>([])
  const [buscando, setBuscando]       = useState(false)
  const [seleccionado, setSeleccionado] = useState<{ id: string; nombre: string } | null>(null)
  const [guardando, setGuardando]     = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const texto = busqueda.trim()
    if (texto.length < 2) { setResultados([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await supabase
        .from('clientes').select('id,nombre,celular')
        .eq('tenant_id', tenantId).is('fusionado_con_id', null)
        .or(`nombre.ilike.%${texto}%,celular.ilike.%${texto}%`)
        .limit(8)
      setResultados((data ?? []) as { id: string; nombre: string; celular: string | null }[])
      setBuscando(false)
    }, 280)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  async function confirmar() {
    if (!seleccionado || guardando) return
    setGuardando(true)
    const res = await fetch('/api/admin/motos/cambiar-propietario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moto_id: motoId, nuevo_cliente_id: seleccionado.id }),
    })
    if (res.ok) { onDone() }
    else { const j = await res.json(); alert(j.error ?? 'Error'); setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900">Cambiar propietario</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Moto <span className="font-mono font-semibold">{motoPlaca}</span> — el propietario anterior quedará en el historial.
          </p>
        </div>
        <div className="px-5 py-3 border-b relative">
          <input ref={inputRef} value={busqueda} onChange={e => { setBusqueda(e.target.value); setSeleccionado(null) }}
            placeholder="Buscar cliente por nombre o celular..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8" />
          {buscando && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto max-h-64 p-3 space-y-1.5">
          {resultados.length === 0 && busqueda.length >= 2 && !buscando && (
            <p className="text-center text-sm text-gray-400 py-6">Sin resultados</p>
          )}
          {resultados.map(c => (
            <button key={c.id} onClick={() => setSeleccionado(s => s?.id === c.id ? null : { id: c.id, nombre: c.nombre })}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                seleccionado?.id === c.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <p className="font-semibold text-sm text-gray-900">{c.nombre}</p>
              {c.celular && <p className="text-xs text-gray-500">{c.celular}</p>}
            </button>
          ))}
        </div>
        {seleccionado && (
          <div className="px-5 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-700">
            Asignar moto a <strong>{seleccionado.nombre}</strong>. El dueño anterior quedará registrado en el historial.
          </div>
        )}
        <div className="flex gap-2 px-5 py-4 border-t">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
          <button onClick={confirmar} disabled={!seleccionado || guardando}
            className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function MotoPerfilPage() {
  const { profile } = useAuth()
  const params      = useParams()
  const router      = useRouter()
  const supabase    = createClient()
  const motoId      = params.id as string

  const [moto, setMoto]               = useState<Moto | null>(null)
  const [ordenes, setOrdenes]         = useState<Orden[]>([])
  const [propietarios, setPropietarios] = useState<Propietario[]>([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState<Tab>('servicio')

  // Modales
  const [editando, setEditando]             = useState(false)
  const [cambiandoDueno, setCambiandoDueno] = useState(false)

  // Campos edición
  const [eMarca, setEMarca]   = useState('')
  const [eModelo, setEModelo] = useState('')
  const [eAño, setEAño]       = useState('')
  const [eColor, setEColor]   = useState('')
  const [eKm, setEKm]         = useState('')
  const [eNotas, setENotas]   = useState('')
  const [saving, setSaving]   = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id || !motoId) return
    setLoading(true)

    const [{ data: m }, { data: ords }, { data: props }] = await Promise.all([
      supabase.from('motos')
        .select('id,placa,marca,modelo,año,color,kilometraje,notas,cliente_id,created_at,clientes:cliente_id(id,nombre,celular)')
        .eq('id', motoId).eq('tenant_id', profile.tenant_id).single(),
      supabase.from('ordenes')
        .select('id,numero,estado,tipo_orden,valor_total,created_at,descripcion_problema:descripcion,cliente')
        .eq('tenant_id', profile.tenant_id)
        .or(`moto_id.eq.${motoId},placa.eq.${('' as string)}`) // filled below after moto loads
        .order('created_at', { ascending: false }),
      supabase.from('historial_propietarios_moto')
        .select('id,fecha_desde,fecha_hasta,notas,clientes:cliente_id(id,nombre,celular)')
        .eq('moto_id', motoId)
        .order('fecha_desde', { ascending: false }),
    ])

    if (!m) { router.push('/admin/motos'); return }

    const motoData = m as unknown as Moto
    setMoto(motoData)
    setPropietarios((props ?? []) as unknown as Propietario[])

    // Recargar ordenes con la placa real
    const { data: ordsReal } = await supabase
      .from('ordenes')
      .select('id,numero,estado,tipo_orden,valor_total,created_at,descripcion_problema:descripcion,cliente')
      .eq('tenant_id', profile.tenant_id)
      .or(`moto_id.eq.${motoId},placa.eq.${motoData.placa}`)
      .order('created_at', { ascending: false })

    setOrdenes((ordsReal ?? ords ?? []) as unknown as Orden[])
    setLoading(false)
  }, [profile?.tenant_id, motoId])

  useEffect(() => { cargar() }, [cargar])

  const abrirEditar = () => {
    if (!moto) return
    setEMarca(moto.marca ?? ''); setEModelo(moto.modelo ?? '')
    setEAño(moto.año ? String(moto.año) : ''); setEColor(moto.color ?? '')
    setEKm(moto.kilometraje ? String(moto.kilometraje) : ''); setENotas(moto.notas ?? '')
    setEditando(true)
  }

  const guardarEdicion = async () => {
    if (!moto) return
    setSaving(true)
    const nuevo = {
      marca: eMarca || null, modelo: eModelo || null,
      año: eAño ? parseInt(eAño) : null, color: eColor || null,
      kilometraje: eKm ? parseInt(eKm) : null, notas: eNotas || null,
    }
    await supabase.from('motos').update({
      ...nuevo,
      updated_at: new Date().toISOString(),
    }).eq('id', moto.id)
    await registrarAuditoria(supabase, {
      tenant_id: profile?.tenant_id ?? '',
      tabla: 'motos',
      registro_id: moto.id,
      tipo: 'edicion',
      valor_anterior: { marca: moto.marca, modelo: moto.modelo, año: moto.año, color: moto.color, kilometraje: moto.kilometraje, notas: moto.notas },
      valor_nuevo: nuevo,
      descripcion: `Editó datos de la moto ${moto.placa}`,
      usuario_id: profile?.id,
    })
    setSaving(false); setEditando(false); cargar()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!moto) return null

  const totalFacturado = ordenes.filter(o => o.estado === 'listo').reduce((s, o) => s + o.valor_total, 0)
  const tieneActiva    = ordenes.some(o => ['falta_revision','en_proceso','pendiente'].includes(o.estado))

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/admin/motos" className="hover:text-blue-600">Motos</Link>
        <span>›</span>
        <span className="font-mono font-bold text-gray-700">{moto.placa}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-3xl flex-shrink-0">
              🏍️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold font-mono text-gray-900">{moto.placa}</h1>
                {tieneActiva && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">En taller</span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-0.5">
                {[moto.marca, moto.modelo, moto.año].filter(Boolean).join(' ')}
                {moto.color ? ` · ${moto.color}` : ''}
                {moto.kilometraje ? ` · ${moto.kilometraje.toLocaleString()} km` : ''}
              </p>
              {moto.clientes ? (
                <p className="text-sm mt-1">
                  <span className="text-gray-500">Propietario: </span>
                  <Link href={`/admin/clientes/${moto.clientes.id}`}
                    className="font-semibold text-blue-700 hover:underline">
                    {moto.clientes.nombre}
                  </Link>
                  {moto.clientes.celular && <span className="text-gray-400 text-xs ml-2">{moto.clientes.celular}</span>}
                </p>
              ) : (
                <p className="text-sm text-amber-600 mt-1 font-medium">⚠️ Sin propietario asignado</p>
              )}
              {moto.notas && <p className="text-xs text-gray-400 italic mt-1">{moto.notas}</p>}
              <p className="text-xs text-gray-400 mt-1">Registrada el {fmt(moto.created_at)}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setCambiandoDueno(true)}
              className="text-sm text-purple-600 hover:text-purple-800 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-lg transition-colors">
              👤 Cambiar propietario
            </button>
            <button onClick={abrirEditar}
              className="text-sm text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-colors">
              Editar
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-gray-100">
          {[
            { label: 'Órdenes',        value: ordenes.length,         color: 'text-blue-700'    },
            { label: 'Facturado (ST)', value: formatCOP(totalFacturado), color: 'text-emerald-700' },
            { label: 'Propietarios',   value: propietarios.length,    color: 'text-purple-700'  },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-4">
        {([
          { id: 'servicio',      label: `Servicio técnico (${ordenes.length})`      },
          { id: 'propietarios',  label: `Propietarios (${propietarios.length})`     },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Servicio técnico ── */}
      {tab === 'servicio' && (
        <div className="space-y-2">
          {ordenes.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">Sin órdenes de servicio registradas para esta moto.</p>
          )}
          {ordenes.map(o => (
            <Link key={o.id} href={`/admin/ordenes/${o.id}`}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
                  o.tipo_orden === 'venta_repuestos' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {o.tipo_orden === 'venta_repuestos' ? 'Venta' : 'ST'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">#{o.numero}</p>
                  {o.descripcion_problema && (
                    <p className="text-xs text-gray-500 truncate max-w-xs">{o.descripcion_problema}</p>
                  )}
                  {o.cliente && (
                    <p className="text-xs text-gray-400">Cliente: {o.cliente}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-400">{fmtCorta(o.created_at)}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${ESTADO_COLOR[o.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ESTADO_LABEL[o.estado] ?? o.estado}
                </span>
                <span className="text-sm font-semibold text-gray-800">{formatCOP(o.valor_total)}</span>
                <span className="text-gray-300">›</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Tab: Propietarios ── */}
      {tab === 'propietarios' && (
        <div className="space-y-3">
          {propietarios.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">Sin historial de propietarios.</p>
          )}
          <div className="relative pl-6 border-l-2 border-gray-200 space-y-4">
            {propietarios.map((p, i) => {
              const cliente = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes
              const esActual = !p.fecha_hasta
              return (
                <div key={p.id} className="relative">
                  <div className={`absolute -left-7 w-4 h-4 rounded-full border-2 border-white ${
                    esActual ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div className={`rounded-xl border px-4 py-3 ${
                    esActual ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {cliente ? (
                          <Link href={`/admin/clientes/${cliente.id}`}
                            className="font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                            {cliente.nombre}
                          </Link>
                        ) : (
                          <span className="font-semibold text-gray-400 italic">Cliente eliminado</span>
                        )}
                        {cliente?.celular && (
                          <p className="text-xs text-gray-500">{cliente.celular}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          Desde {fmt(p.fecha_desde)}
                          {p.fecha_hasta
                            ? ` · Hasta ${fmt(p.fecha_hasta)} · ${mesesEntre(p.fecha_desde, p.fecha_hasta)}`
                            : ` · ${mesesEntre(p.fecha_desde, null)} como propietario`}
                        </p>
                        {p.notas && <p className="text-xs text-gray-500 italic mt-0.5">{p.notas}</p>}
                      </div>
                      {esActual && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                          Actual
                        </span>
                      )}
                      {i === propietarios.length - 1 && !esActual && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                          Primer dueño
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Modal editar ── */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900">Editar moto</h2>
              <p className="text-sm text-gray-500 font-mono">{moto.placa}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Marca',        value: eMarca,  set: setEMarca,  placeholder: 'Honda',  type: 'text'   },
                { label: 'Modelo',       value: eModelo, set: setEModelo, placeholder: 'CB 125', type: 'text'   },
                { label: 'Año',          value: eAño,    set: setEAño,    placeholder: '2022',   type: 'number' },
                { label: 'Color',        value: eColor,  set: setEColor,  placeholder: 'Rojo',   type: 'text'   },
                { label: 'Kilometraje',  value: eKm,     set: setEKm,     placeholder: '12500',  type: 'number' },
              ]).map(f => (
                <div key={f.label} className={f.label === 'Kilometraje' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea value={eNotas} onChange={e => setENotas(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Observaciones sobre la moto..." />
            </div>
            <div className="flex gap-2">
              <button onClick={guardarEdicion} disabled={saving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setEditando(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cambiar propietario ── */}
      {cambiandoDueno && profile?.tenant_id && (
        <CambiarPropietarioModal
          tenantId={profile.tenant_id}
          motoId={moto.id}
          motoPlaca={moto.placa}
          onDone={() => { setCambiandoDueno(false); cargar() }}
          onCancel={() => setCambiandoDueno(false)}
        />
      )}
    </div>
  )
}
