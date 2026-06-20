'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useClienteUpload } from '@/hooks/useClienteUpload'

interface Props {
  clienteId: string
}

type Archivo = { id: string; tipo: string; nombre_archivo: string | null; created_at: string }

const ICONO: Record<string, string> = { pdf: '📄', imagen: '🖼️', excel: '📊', word: '📝', otro: '📎' }

export default function ArchivosTab({ clienteId }: Props) {
  const supabase = createClient()
  const { uploadFiles, uploading } = useClienteUpload(clienteId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('archivos_cliente')
      .select('id, tipo, nombre_archivo, created_at').eq('cliente_id', clienteId).order('created_at', { ascending: false })
    setArchivos((data ?? []) as Archivo[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    try {
      await uploadFiles(Array.from(files))
      cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir')
    }
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
        onChange={e => onFiles(e.target.files)} className="hidden" id="archivo-cliente-input" />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50">
        {uploading ? 'Subiendo...' : '+ Subir PDF, imagen, Excel o Word'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {archivos.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin archivos aún</p>}

      <div className="space-y-1.5">
        {archivos.map(a => (
          <div key={a.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <a href={`/api/archivos-cliente/${a.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-700 truncate flex-1">
              <span>{ICONO[a.tipo] ?? '📎'}</span>
              <span className="truncate">{a.nombre_archivo ?? 'Archivo'}</span>
            </a>
            <button onClick={() => eliminar(a.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">Eliminar</button>
          </div>
        ))}
      </div>
    </div>
  )
}
