'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
}

type Media = {
  id: string
  tipo: string
  contenido: string | null
  media_url: string | null
  direccion: string
  created_at: string
}

const ICONO: Record<string, string> = { imagen: '🖼️', documento: '📄', audio: '🎵', video: '🎬' }

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Todo lo que se manda por el chat (WhatsApp/Messenger/Instagram) — fotos,
// documentos, audios y videos — separado de la pestaña Archivos, que es solo
// para lo que se sube manualmente ahí. Las fotos que el CLIENTE manda ya se
// guardan de forma permanente en R2 apenas llegan (ver webhook-processor.ts);
// las que quedaron guardadas antes de ese cambio como referencia a Meta
// (meta-media://) se sirven vía el mismo proxy que usa la Bandeja.
export default function MultimediaTab({ clienteId }: Props) {
  const supabase = createClient()
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'imagen' | 'documento' | 'audio' | 'video'>('todos')

  const cargar = useCallback(async () => {
    const { data: convs } = await supabase.from('conversaciones').select('id').eq('cliente_id', clienteId)
    const convIds = (convs ?? []).map(c => c.id)
    if (!convIds.length) { setMedia([]); setLoading(false); return }
    const { data } = await supabase
      .from('mensajes')
      .select('id, tipo, contenido, media_url, direccion, created_at')
      .in('conversacion_id', convIds)
      .in('tipo', ['imagen', 'documento', 'audio', 'video'])
      .order('created_at', { ascending: false })
    setMedia((data ?? []) as Media[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  function urlReal(m: Media): string | null {
    if (!m.media_url) return null
    return m.media_url.startsWith('meta-media://')
      ? `/api/admin/mensajes/meta-media/${m.media_url.slice('meta-media://'.length)}`
      : m.media_url
  }

  const filtrados = filtro === 'todos' ? media : media.filter(m => m.tipo === filtro)

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Multimedia del chat</p>
        <span className="text-xs text-gray-400">{filtrados.length}</span>
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">Fotos, documentos, audios y videos intercambiados en la conversación (no confundir con la pestaña Archivos, que es para documentos formales del cliente).</p>

      <div className="flex gap-1.5 flex-wrap">
        {(['todos', 'imagen', 'documento', 'audio', 'video'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              filtro === f ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
            }`}>
            {f === 'todos' ? 'Todos' : `${ICONO[f]} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
          </button>
        ))}
      </div>

      {filtrados.length === 0 && (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center">Sin multimedia en el chat todavía.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {filtrados.map(m => {
          const url = urlReal(m)
          return (
            <a key={m.id} href={url ?? undefined} target="_blank" rel="noopener noreferrer"
              className={`block rounded-lg border border-gray-200 overflow-hidden bg-gray-50 ${!url ? 'pointer-events-none opacity-50' : 'hover:border-blue-300'}`}>
              {m.tipo === 'imagen' && url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={m.contenido ?? 'Imagen'} className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center text-3xl">{ICONO[m.tipo] ?? '📎'}</div>
              )}
              <div className="px-2 py-1.5">
                <p className="text-[10px] text-gray-600 truncate">{m.contenido || (ICONO[m.tipo] ?? '')} {m.direccion === 'saliente' ? '· enviado' : '· recibido'}</p>
                <p className="text-[10px] text-gray-400">{fmtFecha(m.created_at)}</p>
                {!url && <p className="text-[10px] text-red-500">Ya no disponible</p>}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
