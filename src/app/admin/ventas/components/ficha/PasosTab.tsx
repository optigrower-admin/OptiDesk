'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
  tenantId:  string
  usuarioId: string
  clienteEmail?: string | null
}

type PasoItem = { source: 'paso'; id: string; texto: string; completado: boolean; fecha: null }
type RecItem  = { source: 'rec';  id: string; texto: string | null; completado: boolean; fecha: string; enviar_email: boolean }
type Item = PasoItem | RecItem

function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function PasosTab({ clienteId, tenantId, usuarioId, clienteEmail }: Props) {
  const supabase = createClient()
  const [items, setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  // Nueva acción — siempre requiere fecha y hora
  const [texto,       setTexto]       = useState('')
  const [fecha,       setFecha]       = useState('')
  const [envEmail,    setEnvEmail]    = useState(false)
  const [emailDest,   setEmailDest]   = useState(clienteEmail ?? '')
  const [adding,      setAdding]      = useState(false)

  // Reprogramar (rec existente o paso legado sin fecha)
  const [reprogramarId,    setReprogramarId]    = useState<string | null>(null)
  const [reprogramarFecha, setReprogramarFecha] = useState('')
  const [savingReprog,     setSavingReprog]     = useState(false)

  const [confirmId, setConfirmId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [{ data: pasos }, { data: recs }] = await Promise.all([
      supabase.from('clientes_pasos')
        .select('id, descripcion, completado, orden')
        .eq('cliente_id', clienteId).order('orden'),
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, completado, enviar_email')
        .eq('cliente_id', clienteId).order('fecha_recordatorio', { ascending: true }),
    ])
    const p: PasoItem[] = (pasos ?? []).map(x => ({
      source: 'paso', id: x.id as string, texto: x.descripcion as string,
      completado: x.completado as boolean, fecha: null,
    }))
    const r: RecItem[] = (recs ?? []).map(x => ({
      source: 'rec', id: x.id as string, texto: x.nota as string | null,
      completado: x.completado as boolean, fecha: x.fecha_recordatorio as string,
      enviar_email: x.enviar_email as boolean,
    }))
    setItems([...p, ...r])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function syncProxima() {
    const { data: prox } = await supabase.from('recordatorios')
      .select('nota, fecha_recordatorio')
      .eq('cliente_id', clienteId).eq('completado', false)
      .order('fecha_recordatorio', { ascending: true }).limit(1).maybeSingle()
    await supabase.from('clientes').update({
      proxima_accion:       prox?.nota ?? null,
      proxima_accion_fecha: prox?.fecha_recordatorio ?? null,
    }).eq('id', clienteId)
  }

  async function agregar() {
    const t = texto.trim()
    if (!t || !fecha || adding) return
    setAdding(true)
    try {
      await supabase.from('recordatorios').insert({
        cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
        nota: t, fecha_recordatorio: new Date(fecha).toISOString(),
        completado: false, tipo: 'manual',
        enviar_email: envEmail,
        email_destino: envEmail ? (emailDest || null) : null,
      })
      await syncProxima()
      setTexto(''); setFecha(''); setEnvEmail(false)
      cargar()
    } finally { setAdding(false) }
  }

  async function completar(item: Item) {
    if (item.source === 'paso') {
      await supabase.from('clientes_pasos').update({
        completado: true, completado_por: usuarioId, completado_at: new Date().toISOString(),
      }).eq('id', item.id)
    } else {
      await supabase.from('recordatorios').update({
        completado: true, completado_at: new Date().toISOString(),
      }).eq('id', item.id)
      await syncProxima()
    }
    cargar()
  }

  async function descompletar() {
    const item = items.find(i => i.id === confirmId)
    if (!item) return
    if (item.source === 'paso') {
      await supabase.from('clientes_pasos').update({
        completado: false, completado_por: null, completado_at: null,
      }).eq('id', item.id)
    } else {
      await supabase.from('recordatorios').update({ completado: false, completado_at: null }).eq('id', item.id)
      await syncProxima()
    }
    setConfirmId(null)
    cargar()
  }

  async function eliminar(item: Item) {
    if (item.source === 'paso') {
      await supabase.from('clientes_pasos').delete().eq('id', item.id)
    } else {
      await supabase.from('recordatorios').delete().eq('id', item.id)
      await syncProxima()
    }
    cargar()
  }

  async function duplicar(item: RecItem) {
    const nuevaFecha = new Date(new Date(item.fecha).getTime() + 24 * 60 * 60 * 1000)
    await supabase.from('recordatorios').insert({
      cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
      nota: item.texto, fecha_recordatorio: nuevaFecha.toISOString(),
      completado: false, tipo: 'manual', enviar_email: item.enviar_email,
    })
    await syncProxima()
    cargar()
  }

  function abrirReprogramar(item: Item) {
    if (reprogramarId === item.id) { setReprogramarId(null); setReprogramarFecha(''); return }
    setReprogramarId(item.id)
    setReprogramarFecha(item.source === 'rec' ? item.fecha.slice(0, 16) : '')
  }

  async function guardarReprogramar(item: Item) {
    if (!reprogramarFecha || savingReprog) return
    setSavingReprog(true)
    try {
      if (item.source === 'rec') {
        await supabase.from('recordatorios').update({ fecha_recordatorio: new Date(reprogramarFecha).toISOString() }).eq('id', item.id)
      } else {
        // Paso legado sin fecha: se convierte en acción con fecha y se retira el paso original.
        await supabase.from('recordatorios').insert({
          cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
          nota: item.texto, fecha_recordatorio: new Date(reprogramarFecha).toISOString(),
          completado: false, tipo: 'manual', enviar_email: false,
        })
        await supabase.from('clientes_pasos').delete().eq('id', item.id)
      }
      await syncProxima()
      setReprogramarId(null); setReprogramarFecha('')
      cargar()
    } finally { setSavingReprog(false) }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  const now = Date.now()
  const pendientes  = items.filter(i => !i.completado)
  const completados = items.filter(i => i.completado)

  const sorted = [
    // Vencidas primero
    ...pendientes.filter(i => i.source === 'rec' && new Date((i as RecItem).fecha).getTime() < now)
      .sort((a, b) => new Date((a as RecItem).fecha).getTime() - new Date((b as RecItem).fecha).getTime()),
    // Futuras
    ...pendientes.filter(i => i.source === 'rec' && new Date((i as RecItem).fecha).getTime() >= now)
      .sort((a, b) => new Date((a as RecItem).fecha).getTime() - new Date((b as RecItem).fecha).getTime()),
    // Pasos legados sin fecha
    ...pendientes.filter(i => i.source === 'paso'),
    // Completadas al final
    ...completados,
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</p>

      {/* Formulario nueva acción — fecha y hora obligatorias */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <input value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="ej: Confirmar dirección de entrega"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />

        <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={envEmail} onChange={e => setEnvEmail(e.target.checked)} className="rounded" />
          <span className="text-xs text-gray-600">📧 Enviar por correo</span>
        </label>
        {envEmail && (
          <input value={emailDest} onChange={e => setEmailDest(e.target.value)} placeholder="correo@destino.com"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
        )}

        <button onClick={agregar} disabled={!texto.trim() || !fecha || adding}
          className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors">
          {adding ? 'Guardando...' : '+ Agregar acción'}
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Sin acciones definidas</p>
      )}

      <div className="space-y-1.5">
        {sorted.map(item => {
          const isRec    = item.source === 'rec'
          const vencido  = isRec && !item.completado && new Date((item as RecItem).fecha).getTime() < now
          const isConfirm = confirmId === item.id
          const isReprog  = reprogramarId === item.id

          const bg = isConfirm
            ? 'bg-white border-gray-200'
            : item.completado
              ? 'bg-green-50 border-green-200'
              : vencido
                ? 'bg-red-50 border-red-300'
                : isRec
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-gray-200'

          return (
            <div key={`${item.source}-${item.id}`} className="rounded-xl border overflow-hidden">
              <div className={`px-3 py-2 ${bg}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {isRec && (
                      <p className={`text-[10px] font-bold mb-0.5 ${vencido ? 'text-red-600' : item.completado ? 'text-green-600' : 'text-blue-600'}`}>
                        {item.completado ? '✓ ' : vencido ? '⏰ ' : '📌 '}{fmt((item as RecItem).fecha)}
                      </p>
                    )}
                    <p className={`text-sm ${item.completado ? 'line-through text-gray-400' : vencido ? 'text-red-800' : 'text-gray-800'}`}>
                      {item.texto ?? '—'}
                    </p>
                    {isRec && (item as RecItem).enviar_email && (
                      <p className="text-[10px] text-gray-400 mt-0.5">📧 con correo</p>
                    )}
                  </div>
                  {!isConfirm && (
                    <button onClick={() => eliminar(item)} className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs transition-colors">✕</button>
                  )}
                </div>

                {/* Hecho/Pendiente · Duplicar · Reprogramar — siempre visibles */}
                {!isConfirm && (
                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => { if (item.completado) setConfirmId(item.id); else completar(item) }}
                      className={`flex-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                        item.completado ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {item.completado ? '✓ Hecho' : '⏳ Pendiente'}
                    </button>
                    {isRec && (
                      <button onClick={() => duplicar(item as RecItem)}
                        className="flex-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                        🔁 Duplicar
                      </button>
                    )}
                    <button onClick={() => abrirReprogramar(item)}
                      className="flex-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                      📅 Reprogramar
                    </button>
                  </div>
                )}
              </div>

              {/* Panel reprogramar */}
              {isReprog && (
                <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 space-y-1.5">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Nueva fecha y hora</p>
                  <input type="datetime-local" value={reprogramarFecha} onChange={e => setReprogramarFecha(e.target.value)}
                    className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <div className="flex gap-2">
                    <button onClick={() => guardarReprogramar(item)} disabled={!reprogramarFecha || savingReprog}
                      className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
                      {savingReprog ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setReprogramarId(null); setReprogramarFecha('') }}
                      className="px-2.5 py-1.5 border border-amber-200 text-amber-600 hover:bg-amber-100 rounded-lg text-xs transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmar desmarcar */}
              {isConfirm && (
                <div className="bg-red-50 border-t border-red-200 px-3 py-2 text-xs text-red-700">
                  <p className="font-semibold mb-2">¿Estás seguro? Saldrá como si no se hubiera completado.</p>
                  <div className="flex gap-2">
                    <button onClick={descompletar}
                      className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold">
                      Sí, desmarcar
                    </button>
                    <button onClick={() => setConfirmId(null)}
                      className="flex-1 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-semibold">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
