import sharp from 'sharp'

/** Reduce resolución + calidad JPEG. Si falla o el resultado no queda más
 * liviano, se devuelve el buffer original sin tocar (nunca bloquea la subida). */
export async function comprimirImagen(buffer: Buffer, mimeType: string, nombre: string): Promise<{ buffer: Buffer; mimeType: string; nombre: string }> {
  if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') return { buffer, mimeType, nombre }
  try {
    const comprimido = await sharp(buffer)
      .rotate() // respeta la orientación EXIF antes de perderla al recomprimir
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 74, mozjpeg: true })
      .toBuffer()
    if (comprimido.length < buffer.length) {
      const nuevoNombre = nombre.replace(/\.[^.]+$/, '') + '.jpg'
      return { buffer: comprimido, mimeType: 'image/jpeg', nombre: nuevoNombre }
    }
    return { buffer, mimeType, nombre }
  } catch (e) {
    console.error('[comprimirImagen] falló, se sube el original:', e)
    return { buffer, mimeType, nombre }
  }
}
