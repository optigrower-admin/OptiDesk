'use client'
import { useState } from 'react'

interface UploadedArchivo {
  id: string
  url: string
  tipo: 'imagen' | 'pdf' | 'excel' | 'word' | 'otro'
  nombre_archivo: string
}

export function useClienteUpload(clienteId: string) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function uploadFiles(files: File[]): Promise<UploadedArchivo[]> {
    setUploading(true)
    setProgress(0)
    const results: UploadedArchivo[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const formData = new FormData()
      formData.append('file', file)
      formData.append('cliente_id', clienteId)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Error subiendo ${file.name}`)
      }

      const data = await res.json()
      results.push(data)
      setProgress(Math.round(((i + 1) / files.length) * 100))
    }

    setUploading(false)
    return results
  }

  return { uploadFiles, uploading, progress }
}
