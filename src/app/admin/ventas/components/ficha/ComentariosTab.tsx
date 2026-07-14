'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type Usuario = { nombre: string } | null
type Comentario = { id: string; texto: string; created_at: string; usuarios: Usuario }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ComentariosTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [texto, setTexto]     = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading]   = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('comentarios_cliente')
      .select('id, texto, created_at, usuarios(nombre)')
      .eq('cliente_id', clienteId).order('created_at', { ascending: false })
    setComentarios((data ?? []).map(c => ({
      ...c, usuarios: Array.isArray(c.usuarios) ? c.usuarios[0] ?? null : c.usuarios,
    })) as Comentario[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    const { error } = await supabase.from('comentarios_cliente').insert({
      cliente_id: clienteId, tenant_id: tenantId, texto: t, autor_id: usuarioId,
    })
    if (!error) { setTexto(''); cargar() }
    setEnviando(false)
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-4">Cargando comentarios...</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Comentarios</p>
        {comentarios.length > 0 && (
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{comentarios.length}</span>
        )}
      </div>

      {/* Input nuevo comentario */}
      <div className="flex gap-2">
        <textarea value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar() }}
          rows={2}
          placeholder="Escribe un comentario... (Ctrl+Enter para enviar)"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        <button onClick={enviar} disabled={!texto.trim() || enviando}
          className="px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors">
          {enviando ? '...' : 'Enviar'}
        </button>
      </div>

      {comentarios.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-3">Sin comentarios aún</p>
      )}

      <div className="space-y-2">
        {comentarios.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{c.texto}</p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500">{c.usuarios?.nombre ?? 'Usuario'}</span>
              <span className="text-xs text-gray-400">{formatDateHour(c.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
