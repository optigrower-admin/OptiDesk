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

  // New item form
  const [texto,       setTexto]       = useState('')
  const [conRec,      setConRec]      = useState(false)
  const [fecha,       setFecha]       = useState('')
  const [envEmail,    setEnvEmail]    = useState(false)
  const [emailDest,   setEmailDest]   = useState(clienteEmail ?? '')
  const [adding,      setAdding]      = useState(false)

  // Inline reminder for existing paso
  const [addRecId,    setAddRecId]    = useState<string | null>(null)
  const [addRecFecha, setAddRecFecha] = useState('')
  const [addRecEmail, setAddRecEmail] = useState(false)
  const [savingRec,   setSavingRec]   = useState(false)

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
    if (!t || adding) return
    setAdding(true)
    try {
      if (conRec && fecha) {
        await supabase.from('recordatorios').insert({
          cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
          nota: t, fecha_recordatorio: new Date(fecha).toISOString(),
          completado: false, tipo: 'manual',
          enviar_email: envEmail,
          email_destino: envEmail ? (emailDest || null) : null,
        })
        await syncProxima()
      } else {
        await supabase.from('clientes_pasos').insert({
          cliente_id: clienteId, tenant_id: tenantId, descripcion: t,
          orden: items.filter(i => i.source === 'paso').length,
          created_by: usuarioId,
        })
      }
      setTexto(''); setConRec(false); setFecha(''); setEnvEmail(false)
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

  async function crearRecParaPaso(paso: PasoItem) {
    if (!addRecFecha || savingRec) return
    setSavingRec(true)
    await supabase.from('recordatorios').insert({
      cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
      nota: paso.texto, fecha_recordatorio: new Date(addRecFecha).toISOString(),
      completado: false, tipo: 'manual', enviar_email: addRecEmail,
    })
    await syncProxima()
    setSavingRec(false)
    setAddRecId(null); setAddRecFecha(''); setAddRecEmail(false)
    cargar()
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  const now = Date.now()
  const pendientes  = items.filter(i => !i.completado)
  const completados = items.filter(i => i.completado)

  const sorted = [
    // Recordatorios vencidos primero
    ...pendientes.filter(i => i.source === 'rec' && new Date((i as RecItem).fecha).getTime() < now)
      .sort((a, b) => new Date((a as RecItem).fecha).getTime() - new Date((b as RecItem).fecha).getTime()),
    // Recordatorios futuros
    ...pendientes.filter(i => i.source === 'rec' && new Date((i as RecItem).fecha).getTime() >= now)
      .sort((a, b) => new Date((a as RecItem).fecha).getTime() - new Date((b as RecItem).fecha).getTime()),
    // Pasos sin fecha
    ...pendientes.filter(i => i.source === 'paso'),
    // Completados al final
    ...completados,
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasos a seguir</p>

      {/* Formulario nuevo */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !conRec) agregar() }}
            placeholder="ej: Confirmar dirección de entrega"
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <button onClick={agregar} disabled={!texto.trim() || adding}
            className="px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors">
            {adding ? '...' : '+ Agregar'}
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={conRec} onChange={e => setConRec(e.target.checked)} className="rounded" />
          <span className="text-xs text-gray-600">⏰ Con recordatorio (fecha y hora)</span>
        </label>

        {conRec && (
          <div className="space-y-1.5 pl-1">
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
          </div>
        )}
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Sin pasos definidos</p>
      )}

      <div className="space-y-1.5">
        {sorted.map(item => {
          const isRec    = item.source === 'rec'
          const vencido  = isRec && !item.completado && new Date((item as RecItem).fecha).getTime() < now
          const isConfirm = confirmId === item.id

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
              <div className={`flex items-start gap-2 px-3 py-2 ${bg}`}>
                <input type="checkbox" checked={item.completado}
                  onChange={() => { if (item.completado) setConfirmId(item.id); else completar(item) }}
                  className="flex-shrink-0 mt-0.5" />
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
                {!item.completado && !isRec && !isConfirm && (
                  <button
                    onClick={() => {
                      if (addRecId === item.id) { setAddRecId(null); setAddRecFecha(''); setAddRecEmail(false) }
                      else { setAddRecId(item.id); setAddRecFecha(''); setAddRecEmail(false) }
                    }}
                    className="flex-shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors"
                    title="Agregar recordatorio">⏰
                  </button>
                )}
                {!isConfirm && (
                  <button onClick={() => eliminar(item)} className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs transition-colors">✕</button>
                )}
              </div>

              {/* Panel agregar recordatorio a paso existente */}
              {addRecId === item.id && (
                <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 space-y-1.5">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Agregar recordatorio</p>
                  <input type="datetime-local" value={addRecFecha} onChange={e => setAddRecFecha(e.target.value)}
                    className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={addRecEmail} onChange={e => setAddRecEmail(e.target.checked)} className="rounded" />
                    <span className="text-xs text-amber-700">📧 Enviar por correo</span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => crearRecParaPaso(item as PasoItem)} disabled={!addRecFecha || savingRec}
                      className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
                      {savingRec ? '...' : 'Guardar recordatorio'}
                    </button>
                    <button onClick={() => { setAddRecId(null); setAddRecFecha(''); setAddRecEmail(false) }}
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
