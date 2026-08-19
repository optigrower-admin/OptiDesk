'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VARIABLES_CORREO, reemplazarVariablesCorreo, type DatosVariablesCorreo } from '@/lib/ventas/variablesCorreo'
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
  const [catalogoDocumentos, setCatalogoDocumentos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)

  const [plantillaId, setPlantillaId] = useState('')
  const [destinatario, setDestinatario] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [documentosSel, setDocumentosSel] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [{ data: plant }, { data: hist }, { data: archs }, { data: reglas }] = await Promise.all([
      supabase.from('plantillas_correo')
        .select('id, nombre, asunto, cuerpo_html, destinatario, documentos_adjuntos')
        .eq('tenant_id', tenantId).eq('activa', true).order('orden'),
      supabase.from('correos_cliente')
        .select('id, destinatario, asunto, cuerpo, adjuntos, estado, error_mensaje, created_at, plantilla_nombre')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('archivos_cliente').select('tipo_documento').eq('cliente_id', clienteId),
      supabase.from('reglas_etapa').select('documentos_requeridos').eq('campo', 'documento_requerido').eq('activa', true),
    ])
    setPlantillas((plant ?? []) as Plantilla[])
    setHistorial((hist ?? []) as CorreoEnviado[])
    setDocumentosDisponibles(new Set((archs ?? []).map(a => a.tipo_documento).filter(Boolean) as string[]))
    const catalogo = new Set<string>()
    for (const r of reglas ?? []) {
      for (const d of (r.documentos_requeridos ?? []) as string[]) catalogo.add(d)
    }
    setCatalogoDocumentos([...catalogo])
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
  }), [lead, usuarios])

  function aplicarPlantilla(id: string) {
    setPlantillaId(id)
    setError('')
    const p = plantillas.find(x => x.id === id)
    if (!p) { setDestinatario(''); setAsunto(''); setCuerpo(''); setDocumentosSel(new Set()); return }
    setDestinatario(p.destinatario ?? '')
    setAsunto(reemplazarVariablesCorreo(p.asunto, datosVariables))
    setCuerpo(reemplazarVariablesCorreo(p.cuerpo_html, datosVariables))
    setDocumentosSel(new Set(p.documentos_adjuntos ?? []))
  }

  function toggleDocumento(tipo: string) {
    setDocumentosSel(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo); else next.add(tipo)
      return next
    })
  }

  async function enviar() {
    if (!destinatario.trim() || !asunto.trim() || !cuerpo.trim() || enviando) return
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
      setPlantillaId(''); setDestinatario(''); setAsunto(''); setCuerpo(''); setDocumentosSel(new Set())
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

        <input value={destinatario} onChange={e => setDestinatario(e.target.value)}
          placeholder="Destinatario (correo)"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={asunto} onChange={e => setAsunto(e.target.value)}
          placeholder="Asunto"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)}
          placeholder="Cuerpo del correo" rows={5}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />

        {catalogoDocumentos.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Documentos a adjuntar</p>
            <div className="flex flex-wrap gap-1.5">
              {catalogoDocumentos.map(tipo => {
                const activo = documentosSel.has(tipo)
                const disponible = documentosDisponibles.has(tipo)
                return (
                  <button key={tipo} type="button" onClick={() => toggleDocumento(tipo)}
                    title={disponible ? '' : 'Este cliente no tiene un archivo subido de este tipo — no se adjuntará'}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                      activo
                        ? disponible ? 'bg-blue-700 text-white border-blue-700' : 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                    }`}>
                    {activo && !disponible ? '⚠ ' : ''}{tipo}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}

        <button onClick={enviar} disabled={enviando || !destinatario.trim() || !asunto.trim() || !cuerpo.trim()}
          className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors">
          {enviando ? 'Enviando...' : '✉️ Enviar correo'}
        </button>

        <p className="text-[10px] text-gray-400">
          Variables: {VARIABLES_CORREO.map(v => `{${v.clave}}`).join(' ')}
        </p>
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
