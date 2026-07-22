'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
}

type Archivo = {
  id: string
  tipo: string
  nombre_archivo: string | null
  created_at: string
  storage_location: string
  drive_url: string | null
}

const ICONO: Record<string, string> = { pdf: '📄', imagen: '🖼️', excel: '📊', word: '📝', otro: '📎' }

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ArchivosTab({ clienteId }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('archivos_cliente')
      .select('id, tipo, nombre_archivo, created_at, storage_location, drive_url')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
    setArchivos((data ?? []) as Archivo[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('cliente_id', clienteId)
        const res = await fetch('/api/admin/ventas/archivos/subir', { method: 'POST', body: fd })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Error subiendo ${file.name}`)
        }
      }
      await cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este archivo?')) return
    const res = await fetch(`/api/archivos-cliente/${id}`, { method: 'DELETE' })
    if (res.ok) setArchivos(p => p.filter(a => a.id !== id))
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Archivos</p>

      <input ref={fileRef} type="file" multiple accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*"
        onChange={e => onFiles(e.target.files)} className="hidden" />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50">
        {uploading ? 'Subiendo...' : '+ Subir PDF, imagen, Excel o Word'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {archivos.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin archivos aún</p>}

      <div className="space-y-1.5">
        {archivos.map(a => (
          <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <a href={`/api/archivos-cliente/${a.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 min-w-0 flex-1">
              <span className="flex-shrink-0">{ICONO[a.tipo] ?? '📎'}</span>
              <div className="min-w-0">
                <p className="text-sm text-gray-700 hover:text-blue-700 truncate">{a.nombre_archivo ?? 'Archivo'}</p>
                <p className="text-[10px] text-gray-400">
                  {fmtFecha(a.created_at)}{a.storage_location === 'drive' ? ' · Drive' : ''}
                </p>
              </div>
            </a>
            {a.storage_location === 'drive' && a.drive_url && (
              <a href={a.drive_url} target="_blank" rel="noopener noreferrer"
                title="Abrir en Google Drive"
                className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">
                Drive ↗
              </a>
            )}
            <button onClick={() => eliminar(a.id)}
              className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs">
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
