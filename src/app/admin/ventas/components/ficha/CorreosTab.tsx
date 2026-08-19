'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { reemplazarVariablesCorreo, type DatosVariablesCorreo } from '@/lib/ventas/variablesCorreo'
import type { LeadData } from '../LeadCard'

interface Props {
  clienteId: string
  tenantId: string
  lead: LeadData
  usuarios: { id: string; nombre: string }[]
}

type Plantilla = {
  id: string
  nombre: string
  asunto: string
  cuerpo_html: string
  destinatario: string | null
  documentos_adjuntos: string[] | null
  bloquear_si_falta_documento: boolean
}

type CorreoEnviado = {
  id: string
  destinatario: string
  asunto: string
  cuerpo: string
  adjuntos: string[] | null
  estado: 'enviado' | 'error'
  error_mensaje: string | null
  created_at: string
  plantilla_nombre: string | null
}

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function CorreosTab({ clienteId, tenantId, lead, usuarios }: Props) {
  const supabase = createClient()
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [historial, setHistorial] = useState<CorreoEnviado[]>([])
  const [documentosDisponibles, setDocumentosDisponibles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)

  const [plantillaId, setPlantillaId] = useState('')
  const [destinatario, setDestinatario] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [documentosSel, setDocumentosSel] = useState<Set<string>>(new Set())
  const [bloqueaSiFalta, setBloqueaSiFalta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [{ data: plant }, { data: hist }, { data: archs }] = await Promise.all([
      supabase.from('plantillas_correo')
        .select('id, nombre, asunto, cuerpo_html, destinatario, documentos_adjuntos, bloquear_si_falta_documento')
        .eq('tenant_id', tenantId).eq('activa', true).order('orden'),
      supabase.from('correos_cliente')
        .select('id, destinatario, asunto, cuerpo, adjuntos, estado, error_mensaje, created_at, plantilla_nombre')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('archivos_cliente').select('tipo_documento').eq('cliente_id', clienteId),
    ])
    setPlantillas((plant ?? []) as Plantilla[])
    setHistorial((hist ?? []) as CorreoEnviado[])
    setDocumentosDisponibles(new Set((archs ?? []).map(a => a.tipo_documento).filter(Boolean) as string[]))
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  const datosVariables: DatosVariablesCorreo = useMemo(() => ({
    Nombre:  lead.cliente?.nombre ?? '',
    Cedula:  lead.cliente_documento ?? '',
    Placa:   lead.cliente?.placa ?? '',
    Celular: lead.cliente?.celular ?? '',
    Correo:  lead.cliente_email ?? '',
    Moto:    lead.moto_interes ?? '',
    Factura: lead.numero_factura ?? '',
    Asesor:  usuarios.find(u => u.id === lead.assigned_to)?.nombre ?? '',
    'Carta de Negociacion': lead.numero_carta_negociacion ?? '',
  }), [lead, usuarios])

  function aplicarPlantilla(id: string) {
    setPlantillaId(id)
    setError('')
    const p = plantillas.find(x => x.id === id)
    if (!p) { setDestinatario(''); setAsunto(''); setCuerpo(''); setDocumentosSel(new Set()); setBloqueaSiFalta(false); return }
    setDestinatario(p.destinatario ?? '')
    setAsunto(reemplazarVariablesCorreo(p.asunto, datosVariables))
    setCuerpo(reemplazarVariablesCorreo(p.cuerpo_html, datosVariables))
    setDocumentosSel(new Set(p.documentos_adjuntos ?? []))
    setBloqueaSiFalta(p.bloquear_si_falta_documento)
  }

  const faltanDocumentos = useMemo(
    () => [...documentosSel].filter(t => !documentosDisponibles.has(t)),
    [documentosSel, documentosDisponibles]
  )
  const bloqueadoPorDocumentos = bloqueaSiFalta && faltanDocumentos.length > 0

  async function enviar() {
    if (!destinatario.trim() || !asunto.trim() || !cuerpo.trim() || enviando || bloqueadoPorDocumentos) return
    if (!window.confirm(`¿Enviar este correo a ${destinatario}?`)) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/enviar-correo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plantilla_id: plantillaId || null,
          destinatario: destinatario.trim(),
          asunto: asunto.trim(),
          cuerpo: cuerpo.trim(),
          documentos_tipos: [...documentosSel],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar el correo')
      setPlantillaId(''); setDestinatario(''); setAsunto(''); setCuerpo(''); setDocumentosSel(new Set()); setBloqueaSiFalta(false)
      await cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el correo')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-4">
      {/* Nuevo correo */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Enviar correo</p>

        {plantillas.length === 0 ? (
          <p className="text-xs text-gray-400">
            No hay plantillas de correo activas — créalas en Config Ventas → Plantillas de correo.
          </p>
        ) : (
          <select value={plantillaId} onChange={e => aplicarPlantilla(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Selecciona una plantilla...</option>
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        )}

        {plantillaId && (
          <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-2 space-y-1">
            <p className="text-xs text-gray-500">Para: <span className="text-gray-800 font-medium">{destinatario || '—'}</span></p>
            <p className="text-xs text-gray-500">Asunto: <span className="text-gray-800 font-medium">{asunto}</span></p>
            {documentosSel.size > 0 && (
              <p className="text-xs text-gray-500">
                📎 {[...documentosSel].map(d => documentosDisponibles.has(d) ? d : `${d} ⚠`).join(', ')}
              </p>
            )}
          </div>
        )}

        {bloqueadoPorDocumentos && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            🚫 Falta subir: {faltanDocumentos.join(', ')} (pestaña Archivos). Esta plantilla no deja enviar hasta que estén.
          </p>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}

        <button onClick={enviar} disabled={!plantillaId || enviando || !destinatario.trim() || !asunto.trim() || !cuerpo.trim() || bloqueadoPorDocumentos}
          className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors">
          {enviando ? 'Enviando...' : '✉️ Enviar correo'}
        </button>
      </div>

      {/* Historial */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Historial</p>
        {historial.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">Sin correos enviados todavía.</p>
        )}
        <div className="space-y-1.5">
          {historial.map(c => {
            const abierto = expandidoId === c.id
            return (
              <div key={c.id} className="rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setExpandidoId(abierto ? null : c.id)}
                  className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.asunto}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      c.estado === 'enviado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {c.estado === 'enviado' ? '✓ Enviado' : '✗ Error'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtFechaHora(c.created_at)} · Para: {c.destinatario}
                  </p>
                </button>
                {abierto && (
                  <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/50 space-y-1.5">
                    {c.plantilla_nombre && <p className="text-[11px] text-gray-500">Plantilla: {c.plantilla_nombre}</p>}
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{c.cuerpo}</p>
                    {!!c.adjuntos?.length && (
                      <p className="text-[11px] text-gray-500">📎 {c.adjuntos.join(', ')}</p>
                    )}
                    {c.estado === 'error' && c.error_mensaje && (
                      <p className="text-[11px] text-red-600">{c.error_mensaje}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
