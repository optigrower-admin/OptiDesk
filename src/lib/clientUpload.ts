// Sube un archivo (foto/video) de una orden directo a R2 vía URL pre-firmada,
// sin pasar el contenido por una función serverless de Vercel — esas tienen un
// límite de 4.5 MB en el cuerpo de la petición, muy por debajo de un video real
// de celular. Usar SIEMPRE este flujo para subir archivos de órdenes en vez de
// mandar el archivo como FormData a /api/upload.
export interface MedioRegistrado {
  id: string
  url: string
  tipo: 'imagen' | 'video'
}

export async function subirArchivoOrden(params: {
  ordenId: string
  file: File
  tipo: 'imagen' | 'video'
  onProgress?: (pct: number) => void
  onStage?: (stage: 'subiendo' | 'comprimiendo') => void
}): Promise<MedioRegistrado> {
  const { ordenId, file, tipo, onProgress, onStage } = params

  const presignRes = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orden_id: ordenId, tipo, filename: file.name, filetype: file.type }),
  })
  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}))
    throw new Error(err.error ?? 'Error al preparar la subida')
  }
  const presignData = await presignRes.json()

  // Si el tenant tiene Drive configurado para imágenes → subir directamente a Drive
  if (presignData.mode === 'drive') {
    onProgress?.(10)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('orden_id', ordenId)
    fd.append('tipo', tipo)
    const driveRes = await fetch('/api/upload/drive', { method: 'POST', body: fd })
    if (!driveRes.ok) {
      const err = await driveRes.json().catch(() => ({}))
      throw new Error(err.error ?? 'Error al subir la foto a Google Drive')
    }
    onProgress?.(100)
    return await driveRes.json() as MedioRegistrado
  }

  const { url, key, nombreArchivo, contentType } = presignData

  if (file.size === 0) {
    throw new Error('El archivo parece vacío (0 bytes). Puede que esté en la nube sin descargarse. Descárgalo primero e intenta de nuevo.')
  }

  // FileReader en vez de arrayBuffer() — más compatible en Android (algunos
  // fabricantes cuelgan silenciosamente con content:// URIs grandes).
  const fileBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    const timer = setTimeout(() => {
      reader.abort()
      reject(new Error('El archivo tardó demasiado en leerse. Puede estar en la nube sin descargarse, o el dispositivo está ocupado. Intenta de nuevo.'))
    }, 180_000)
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress?.(Math.round((ev.loaded / ev.total) * 40))
    }
    reader.onload = () => {
      clearTimeout(timer)
      resolve(reader.result as ArrayBuffer)
    }
    reader.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`No se pudo leer el archivo: ${reader.error?.message ?? 'acceso denegado por el dispositivo'}. Intenta seleccionarlo de nuevo.`))
    }
    reader.readAsArrayBuffer(file)
  })

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = 600000
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress?.(40 + Math.round((ev.loaded / ev.total) * 60))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 rechazó la subida (HTTP ${xhr.status}). Intenta de nuevo.`))
    }
    xhr.onerror = () => reject(new Error('Error de red al conectar con R2. Verifica tu conexión e intenta de nuevo.'))
    xhr.ontimeout = () => reject(new Error('Tiempo agotado (10 min). Conexión muy lenta o archivo demasiado grande.'))
    xhr.send(fileBuffer)
  })

  const necesitaConversion = tipo === 'video' && !key.toLowerCase().endsWith('.mp4')
  if (necesitaConversion) onStage?.('comprimiendo')

  const regRes = await fetch('/api/upload/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orden_id: ordenId, key, tipo, nombre_archivo: nombreArchivo, tamano_bytes: file.size }),
  })
  if (!regRes.ok) {
    const err = await regRes.json().catch(() => ({}))
    throw new Error(err.error ?? 'Error al registrar el archivo')
  }
  return await regRes.json() as MedioRegistrado
}
