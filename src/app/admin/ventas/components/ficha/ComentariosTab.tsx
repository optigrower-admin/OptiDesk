'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  puedeEditar?: boolean
}

type Usuario = { nombre: string } | null
type Comentario = { id: string; texto: string; created_at: string; usuarios: Usuario }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ComentariosTab({ clienteId, tenantId, usuarioId, puedeEditar = false }: Props) {
  const supabase = createClient()
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [texto, setTexto]     = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState('')

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

  function iniciarEdicion(c: Comentario) {
    setEditandoId(c.id)
    setTextoEdit(c.texto)
  }

  async function guardarEdicion(id: string) {
    const t = textoEdit.trim()
    if (!t) return
    const { error } = await supabase.from('comentarios_cliente').update({ texto: t }).eq('id', id)
    if (!error) { setEditandoId(null); cargar() }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este comentario?')) return
    const { error } = await supabase.from('comentarios_cliente').delete().eq('id', id)
    if (!error) cargar()
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

      <div className="space-y-1.5">
        {comentarios.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
            {editandoId === c.id ? (
              <div className="space-y-1.5">
                <textarea value={textoEdit} onChange={e => setTextoEdit(e.target.value)} rows={2} autoFocus
                  className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
                <div className="flex gap-1.5">
                  <button onClick={() => guardarEdicion(c.id)} disabled={!textoEdit.trim()}
                    className="px-2.5 py-1 bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Guardar</button>
                  <button onClick={() => setEditandoId(null)} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-900 whitespace-pre-wrap leading-snug">{c.texto}</p>
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100">
                  <span className="text-[11px] font-semibold text-gray-500">{c.usuarios?.nombre ?? 'Usuario'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">{formatDateHour(c.created_at)}</span>
                    {puedeEditar && (
                      <>
                        <button onClick={() => iniciarEdicion(c)} title="Editar" className="text-gray-400 hover:text-blue-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => eliminar(c.id)} title="Eliminar" className="text-gray-400 hover:text-red-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
