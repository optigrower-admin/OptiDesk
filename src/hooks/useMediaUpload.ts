'use client'
import { useState } from 'react'

interface UploadedMedia {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string
}

export function useMediaUpload(ordenId: string) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function uploadFiles(files: File[]): Promise<UploadedMedia[]> {
    setUploading(true)
    setProgress(0)
    const results: UploadedMedia[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const formData = new FormData()
      formData.append('file', file)
      formData.append('orden_id', ordenId)
      formData.append('tipo', file.type.startsWith('video/') ? 'video' : 'imagen')

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Error subiendo ${file.name}`)

      const data = await res.json()
      results.push(data)
      setProgress(Math.round(((i + 1) / files.length) * 100))
    }

    setUploading(false)
    return results
  }

  return { uploadFiles, uploading, progress }
}
