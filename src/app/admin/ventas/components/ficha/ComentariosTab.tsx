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
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ComentariosTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [texto, setTexto]   = useState('')
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

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comentarios</p>

      <div className="flex gap-2">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
          placeholder="Escribe un comentario..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        <button onClick={enviar} disabled={!texto.trim() || enviando}
          className="px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
          Enviar
        </button>
      </div>

      {comentarios.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin comentarios aún</p>}

      <div className="space-y-2">
        {comentarios.map(c => (
          <div key={c.id} className="bg-gray-50 rounded-xl px-3 py-2">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.texto}</p>
            <p className="text-xs text-gray-400 mt-1">{c.usuarios?.nombre ?? 'Usuario'} · {formatDateHour(c.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
