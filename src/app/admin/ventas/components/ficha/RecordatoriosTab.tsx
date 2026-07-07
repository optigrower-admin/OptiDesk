'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  clienteEmail: string | null
  onProximaAccionChange?: (proxAccion: string | null, proxFecha: string | null) => void
}

type Recordatorio = { id: string; nota: string | null; fecha_recordatorio: string; completado: boolean; enviar_email: boolean; email_enviado_at: string | null }
type Plantilla = { id: string; nombre: string; asunto: string; cuerpo_html: string }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function RecordatoriosTab({ clienteId, tenantId, usuarioId, clienteEmail, onProximaAccionChange }: Props) {
  const supabase = createClient()
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [plantillas, setPlantillas]       = useState<Plantilla[]>([])
  const [nota, setNota]               = useState('')
  const [fecha, setFecha]             = useState('')
  const [enviarEmail, setEnviarEmail] = useState(false)
  const [emailDestino, setEmailDestino] = useState(clienteEmail ?? '')
  const [plantillaId, setPlantillaId] = useState('')
  const [enviandoCorreo, setEnviandoCorreo] = useState(false)
  const [mensajeCorreo, setMensajeCorreo]   = useState('')
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: recs }, { data: plant }] = await Promise.all([
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, completado, enviar_email, email_enviado_at')
        .eq('cliente_id', clienteId).order('fecha_recordatorio', { ascending: false }),
      supabase.from('plantillas_correo').select('id, nombre, asunto, cuerpo_html').eq('tenant_id', tenantId).eq('activa', true),
    ])
    setRecordatorios((recs ?? []) as Recordatorio[])
    setPlantillas((plant ?? []) as Plantilla[])
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  async function sincronizarProximaAccion() {
    const { data: prox } = await supabase.from('recordatorios')
      .select('nota, fecha_recordatorio')
      .eq('cliente_id', clienteId).eq('completado', false)
      .order('fecha_recordatorio', { ascending: true }).limit(1).maybeSingle()
    await supabase.from('clientes').update({
      proxima_accion: prox?.nota ?? null,
      proxima_accion_fecha: prox?.fecha_recordatorio ?? null,
    }).eq('id', clienteId)
    onProximaAccionChange?.(prox?.nota ?? null, prox?.fecha_recordatorio ?? null)
  }

  async function crear() {
    if (!nota.trim() || !fecha) return
    await supabase.from('recordatorios').insert({
      tenant_id: tenantId, cliente_id: clienteId, asignado_a: usuarioId, nota: nota.trim(),
      fecha_recordatorio: new Date(fecha).toISOString(), tipo: 'manual',
      enviar_email: enviarEmail, email_destino: enviarEmail ? (emailDestino || null) : null,
    })
    setNota(''); setFecha(''); setEnviarEmail(false)
    await sincronizarProximaAccion()
    cargar()
  }

  async function completar(id: string) {
    await supabase.from('recordatorios').update({ completado: true, completado_at: new Date().toISOString() }).eq('id', id)
    await sincronizarProximaAccion()
    cargar()
  }

  async function enviarCorreoAhora() {
    if (!plantillaId || !emailDestino) return
    setEnviandoCorreo(true); setMensajeCorreo('')
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/enviar-correo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id: plantillaId, destinatario_email: emailDestino }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al enviar')
      setMensajeCorreo('✅ Correo enviado')
    } catch (e: unknown) {
      setMensajeCorreo(e instanceof Error ? `❌ ${e.message}` : '❌ Error al enviar')
    } finally {
      setEnviandoCorreo(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  const pendientes = recordatorios.filter(r => !r.completado)
  const pasados     = recordatorios.filter(r => r.completado)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nuevo recordatorio</p>
        <input value={nota} onChange={e => setNota(e.target.value)} placeholder="ej: Llamar para confirmar entrega"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
        <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)} />
          Avisar también por correo
        </label>
        {enviarEmail && (
          <input value={emailDestino} onChange={e => setEmailDestino(e.target.value)} placeholder="correo@destino.com"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
        )}
        <button onClick={crear} disabled={!nota.trim() || !fecha}
          className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
          + Crear recordatorio
        </button>
      </div>

      {plantillas.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Enviar correo con plantilla</p>
          <select value={plantillaId} onChange={e => setPlantillaId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2">
            <option value="">Selecciona una plantilla...</option>
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input value={emailDestino} onChange={e => setEmailDestino(e.target.value)} placeholder="correo@destino.com"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
          <button onClick={enviarCorreoAhora} disabled={!plantillaId || !emailDestino || enviandoCorreo}
            className="w-full py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {enviandoCorreo ? 'Enviando...' : 'Enviar correo ahora'}
          </button>
          {mensajeCorreo && <p className="text-xs text-gray-600 mt-1">{mensajeCorreo}</p>}
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Pendientes</p>
        {pendientes.length === 0 && <p className="text-xs text-gray-400">Sin recordatorios pendientes</p>}
        {pendientes.map(r => (
          <div key={r.id} className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-blue-800">{formatDateHour(r.fecha_recordatorio)}</p>
              <button onClick={() => completar(r.id)} className="text-xs text-blue-600 hover:underline">Marcar hecho</button>
            </div>
            {r.nota && <p className="text-xs text-blue-700 mt-0.5">{r.nota}</p>}
            {r.enviar_email && (
              <p className="text-xs text-blue-400 mt-0.5">
                {r.email_enviado_at ? '✓ correo enviado' : '✉️ se enviará por correo'}
              </p>
            )}
          </div>
        ))}
      </div>

      {pasados.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Completados</p>
          {pasados.map(r => (
            <div key={r.id} className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-2">
              <p className="text-xs font-semibold text-green-700">✓ {formatDateHour(r.fecha_recordatorio)}</p>
              {r.nota && <p className="text-xs text-gray-600 mt-0.5">{r.nota}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
