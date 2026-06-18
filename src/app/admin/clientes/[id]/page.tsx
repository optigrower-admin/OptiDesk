'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'
import { registrarAuditoria } from '@/lib/audit'

// ── Types ──────────────────────────────────────────────────────────────────
type Cliente = {
  id: string; nombre: string; cedula: string | null; celular: string | null
  email: string | null; lead_source: string | null; created_at: string
  whatsapp_number: string | null; messenger_id: string | null; instagram_id: string | null
  notas: string | null
}
type Moto = {
  id: string; placa: string; marca: string | null; modelo: string | null
  año: number | null; color: string | null; kilometraje: number | null
}
type Orden = {
  id: string; numero: number; estado: string; tipo_orden: string | null
  valor_total: number; created_at: string; descripcion_problema: string | null
  placa: string | null
}
type Conversacion = {
  id: string; canal: string; etapa_venta: string | null
  ultimo_mensaje_at: string | null; ultimo_mensaje_texto: string | null
  no_leidos_count: number; updated_at: string
}
type VentaMoto = {
  id: string; modelo: string; valor_venta: number
  metodo_pago: string | null; financiacion: boolean; fecha_venta: string
}
type ClienteVinculado = {
  id: string; nombre: string; celular: string | null; fusionado_at: string
  canales: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatFecha(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatFechaCorta(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' })
}

const ESTADO_COLOR: Record<string, string> = {
  falta_revision: 'bg-red-100 text-red-700',
  en_proceso:     'bg-blue-100 text-blue-700',
  pendiente:      'bg-amber-100 text-amber-700',
  listo:          'bg-green-100 text-green-700',
}
const ESTADO_LABEL: Record<string, string> = {
  falta_revision: 'Falta rev.', en_proceso: 'En proceso',
  pendiente: 'Pendiente',       listo: 'Cerrada',
}
const CANAL_ICON: Record<string, string> = {
  whatsapp: '📱', messenger: '💬', instagram: '📸', manual: '✏️',
}

type Tab = 'ordenes' | 'motos' | 'conversaciones' | 'ventas'

// ── Page ───────────────────────────────────────────────────────────────────
export default function ClienteDetallePage() {
  const { profile } = useAuth()
  const params      = useParams()
  const router      = useRouter()
  const supabase    = createClient()
  const clienteId   = params.id as string

  const [cliente, setCliente]         = useState<Cliente | null>(null)
  const [motos, setMotos]             = useState<Moto[]>([])
  const [ordenes, setOrdenes]         = useState<Orden[]>([])
  const [conversaciones, setConvs]    = useState<Conversacion[]>([])
  const [ventas, setVentas]               = useState<VentaMoto[]>([])
  const [vinculados, setVinculados]       = useState<ClienteVinculado[]>([])
  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState<Tab>('ordenes')
  const [desvinculando, setDesvinculando] = useState<string | null>(null)

  // Edit mode
  const [editando, setEditando]   = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editCedula, setEditCedula] = useState('')
  const [editCelular, setEditCelular] = useState('')
  const [editEmail, setEditEmail]   = useState('')
  const [editNotas, setEditNotas]   = useState('')
  const [saving, setSaving]         = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id || !clienteId) return
    setLoading(true)

    const [{ data: cli }, { data: mts }, { data: ords }, { data: convs }, { data: vnts }, { data: vinc }] = await Promise.all([
      supabase.from('clientes').select('id,nombre,cedula,celular,email,lead_source,created_at,whatsapp_number,messenger_id,instagram_id,notas')
        .eq('id', clienteId).eq('tenant_id', profile.tenant_id).single(),
      supabase.from('motos').select('id,placa,marca,modelo,año,color,kilometraje')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('ordenes').select('id,numero,estado,tipo_orden,valor_total,created_at,descripcion_problema,placa')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('conversaciones').select('id,canal,etapa_venta,ultimo_mensaje_at,ultimo_mensaje_texto,no_leidos_count,updated_at')
        .eq('cliente_id', clienteId).order('updated_at', { ascending: false }),
      supabase.from('ventas_motos').select('id,modelo,valor_venta,metodo_pago,financiacion,fecha_venta')
        .eq('cliente_id', clienteId).order('fecha_venta', { ascending: false }),
      supabase.from('clientes').select('id,nombre,celular,fusionado_at,conversaciones(canal)')
        .eq('fusionado_con_id', clienteId).eq('tenant_id', profile.tenant_id),
    ])

    if (!cli) { router.push('/admin/clientes'); return }

    setCliente(cli as Cliente)
    setMotos((mts ?? []) as Moto[])
    setOrdenes((ords ?? []) as Orden[])
    setConvs((convs ?? []) as Conversacion[])
    setVentas((vnts ?? []) as VentaMoto[])
    setVinculados(((vinc ?? []) as { id: string; nombre: string; celular: string | null; fusionado_at: string; conversaciones: { canal: string }[] }[])
      .map(v => ({
        id: v.id, nombre: v.nombre, celular: v.celular, fusionado_at: v.fusionado_at,
        canales: [...new Set(v.conversaciones.map(c => c.canal))],
      }))
    )
    setLoading(false)
  }, [profile?.tenant_id, clienteId])

  useEffect(() => { cargar() }, [cargar])

  const abrirEditar = () => {
    if (!cliente) return
    setEditNombre(cliente.nombre)
    setEditCedula(cliente.cedula ?? '')
    setEditCelular(cliente.celular ?? '')
    setEditEmail(cliente.email ?? '')
    setEditNotas(cliente.notas ?? '')
    setEditando(true)
  }

  const guardar = async () => {
    if (!cliente) return
    setSaving(true)
    await supabase.from('clientes').update({
      nombre:  editNombre,
      cedula:  editCedula  || null,
      celular: editCelular || null,
      email:   editEmail   || null,
      notas:   editNotas   || null,
    }).eq('id', cliente.id)
    await registrarAuditoria(supabase, {
      tenant_id: profile?.tenant_id ?? '',
      tabla: 'clientes',
      registro_id: cliente.id,
      tipo: 'edicion',
      valor_anterior: { nombre: cliente.nombre, cedula: cliente.cedula, celular: cliente.celular, email: cliente.email, notas: cliente.notas },
      valor_nuevo: { nombre: editNombre, cedula: editCedula || null, celular: editCelular || null, email: editEmail || null, notas: editNotas || null },
      descripcion: `Editó datos del cliente "${editNombre}"`,
      usuario_id: profile?.id,
    })
    setSaving(false)
    setEditando(false)
    cargar()
  }

  const desvincular = async (vinculadoId: string) => {
    if (!confirm('¿Desvincular este perfil? Las conversaciones seguirán en el cliente actual.')) return
    setDesvinculando(vinculadoId)
    const res = await fetch('/api/admin/clientes/desvincular', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: vinculadoId }),
    })
    setDesvinculando(null)
    if (res.ok) cargar()
    else alert('Error al desvincular')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!cliente) return null

  const totalGastado = ordenes.filter(o => o.estado === 'listo').reduce((s, o) => s + o.valor_total, 0)
  const totalVentas  = ventas.reduce((s, v) => s + v.valor_venta, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/admin/clientes" className="hover:text-blue-600 transition-colors">Clientes</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">{cliente.nombre}</span>
      </div>

      {/* Header cliente */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {cliente.nombre[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{cliente.nombre}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                {cliente.cedula  && <span>CC {cliente.cedula}</span>}
                {cliente.celular && <span>📞 {cliente.celular}</span>}
                {cliente.email   && <span>✉️ {cliente.email}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {cliente.whatsapp_number && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">WhatsApp</span>
                )}
                {cliente.messenger_id && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Messenger</span>
                )}
                {cliente.instagram_id && (
                  <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">Instagram</span>
                )}
                {cliente.lead_source && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    Origen: {cliente.lead_source}
                  </span>
                )}
              </div>
              {cliente.notas && (
                <p className="text-xs text-gray-500 mt-2 italic">{cliente.notas}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Cliente desde {formatFecha(cliente.created_at)}</p>
            </div>
          </div>
          <button onClick={abrirEditar}
            className="flex-shrink-0 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-colors">
            Editar
          </button>
        </div>

        {/* Perfiles vinculados */}
        {vinculados.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
              🔗 Perfiles vinculados ({vinculados.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {vinculados.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex gap-1">
                      {v.canales.map(c => (
                        <span key={c} className="text-base" title={c}>
                          {c === 'whatsapp' ? '📱' : c === 'instagram' ? '📸' : c === 'messenger' ? '💬' : '✍️'}
                        </span>
                      ))}
                      {v.canales.length === 0 && <span className="text-gray-300 text-xs">Sin canal</span>}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-purple-900 truncate">{v.nombre}</span>
                      {v.celular && <span className="text-xs text-purple-600 ml-2">{v.celular}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => desvincular(v.id)}
                    disabled={desvinculando === v.id}
                    className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-40 ml-3"
                  >
                    {desvinculando === v.id ? 'Desvinculando...' : 'Desvincular'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-gray-100">
          {[
            { label: 'Órdenes',    value: ordenes.length,      color: 'text-blue-700'   },
            { label: 'Gastado ST', value: formatCOP(totalGastado), color: 'text-emerald-700' },
            { label: 'Motos',      value: motos.length,        color: 'text-purple-700' },
            { label: 'Compras moto', value: ventas.length > 0 ? formatCOP(totalVentas) : '—', color: 'text-orange-700' },
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
          { id: 'ordenes',        label: `Servicio técnico (${ordenes.length})`  },
          { id: 'motos',          label: `Motos (${motos.length})`               },
          { id: 'conversaciones', label: `Conversaciones (${conversaciones.length})` },
          { id: 'ventas',         label: `Compras moto (${ventas.length})`       },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Órdenes ── */}
      {tab === 'ordenes' && (
        <div className="space-y-2">
          {ordenes.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">Sin órdenes de servicio</p>
          )}
          {ordenes.map(o => (
            <Link key={o.id} href={`/admin/ordenes/${o.id}`}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  o.tipo_orden === 'venta_repuestos' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {o.tipo_orden === 'venta_repuestos' ? 'Venta' : 'ST'}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">#{o.numero} {o.placa && `· ${o.placa}`}</p>
                  {o.descripcion_problema && (
                    <p className="text-xs text-gray-500 truncate max-w-xs">{o.descripcion_problema}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-400">{formatFechaCorta(o.created_at)}</span>
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

      {/* ── Motos ── */}
      {tab === 'motos' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {motos.length === 0 && (
            <p className="col-span-2 text-center text-gray-400 text-sm py-10">Sin motos registradas</p>
          )}
          {motos.map(m => (
            <Link key={m.id} href={`/admin/motos/${m.id}`}
              className="bg-white border border-gray-100 rounded-xl px-4 py-3 hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">🏍️</div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 font-mono">{m.placa}</p>
                <p className="text-sm text-gray-600 truncate">
                  {[m.marca, m.modelo, m.año].filter(Boolean).join(' ')}
                </p>
                {(m.color || m.kilometraje) && (
                  <p className="text-xs text-gray-400">
                    {[m.color, m.kilometraje ? `${m.kilometraje.toLocaleString()} km` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <span className="ml-auto text-gray-300">›</span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Conversaciones ── */}
      {tab === 'conversaciones' && (
        <div className="space-y-2">
          {conversaciones.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">Sin conversaciones</p>
          )}
          {conversaciones.map(cv => {
            const etapaConfig = cv.etapa_venta ? ETAPA_MAP[cv.etapa_venta as EtapaVenta] : null
            return (
              <Link key={cv.id} href={`/admin/mensajes/bandeja?conv=${cv.id}`}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm">
                <span className="text-xl">{CANAL_ICON[cv.canal] ?? '💬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 capitalize">{cv.canal}</p>
                    {etapaConfig && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
                        style={{ background: etapaConfig.color }}>
                        {etapaConfig.label}
                      </span>
                    )}
                    {cv.no_leidos_count > 0 && (
                      <span className="w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
                        {cv.no_leidos_count}
                      </span>
                    )}
                  </div>
                  {cv.ultimo_mensaje_texto && (
                    <p className="text-xs text-gray-500 truncate">{cv.ultimo_mensaje_texto}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  {cv.ultimo_mensaje_at && (
                    <p className="text-xs text-gray-400">{formatFechaCorta(cv.ultimo_mensaje_at)}</p>
                  )}
                  <span className="text-gray-300 text-lg">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Ventas moto ── */}
      {tab === 'ventas' && (
        <div className="space-y-2">
          {ventas.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">
              Sin compras de moto registradas. Se registran cuando una venta pasa a "Ganado" y se completa el formulario.
            </p>
          )}
          {ventas.map(v => (
            <div key={v.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{v.modelo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{formatFechaCorta(v.fecha_venta)}</span>
                  {v.metodo_pago && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{v.metodo_pago}</span>
                  )}
                  {v.financiacion && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Financiado</span>
                  )}
                </div>
              </div>
              <p className="text-lg font-bold text-emerald-700">{formatCOP(v.valor_venta)}</p>
            </div>
          ))}
          {ventas.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex justify-between">
              <span className="text-sm font-semibold text-emerald-800">Total compras</span>
              <span className="text-sm font-bold text-emerald-800">{formatCOP(totalVentas)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Modal editar ── */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-900">Editar cliente</h2>
            <div className="space-y-3">
              {[
                { label: 'Nombre *',  value: editNombre,  set: setEditNombre  },
                { label: 'Cédula',    value: editCedula,  set: setEditCedula  },
                { label: 'Celular',   value: editCelular, set: setEditCelular },
                { label: 'Email',     value: editEmail,   set: setEditEmail   },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input value={f.value} onChange={e => f.set(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
                <textarea value={editNotas} onChange={e => setEditNotas(e.target.value)} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={guardar} disabled={saving || !editNombre}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setEditando(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
