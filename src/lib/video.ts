import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

ffmpeg.setFfmpegPath(ffmpegPath as unknown as string)

/**
 * Convierte cualquier video (mov, 3gpp, webm, etc.) a un .mp4 real.
 * Primero intenta un remux rápido (copiar los streams sin re-codificar,
 * válido cuando el video ya viene en H.264/AAC, el caso de casi todos los
 * celulares) y solo si eso falla recodifica completo (más lento).
 */
export async function convertirAMp4(buffer: Buffer, extOriginal: string): Promise<Buffer> {
  const tmpDir = os.tmpdir()
  const id = crypto.randomUUID()
  const inputPath  = path.join(tmpDir, `${id}.${extOriginal || 'bin'}`)
  const outputPath = path.join(tmpDir, `${id}.mp4`)

  await fs.writeFile(inputPath, buffer)
  console.log(`[video] Convirtiendo ${inputPath} (${buffer.length} bytes) → mp4`)

  // Siempre se recodifica a H.264/AAC — un simple remux (copiar streams) no
  // sirve para videos HEVC (formato por defecto en iPhones recientes): el
  // archivo queda con extensión .mp4 pero el codec sigue siendo HEVC, que
  // Chrome/Firefox/Android no pueden reproducir. Recodificar garantiza que
  // el resultado se reproduzca en cualquier dispositivo/navegador.
  await intentarConversion(inputPath, outputPath)

  const resultado = await fs.readFile(outputPath)
  await Promise.all([
    fs.unlink(inputPath).catch(() => {}),
    fs.unlink(outputPath).catch(() => {}),
  ])

  // ffmpeg puede terminar sin error pero producir un archivo vacío/truncado.
  // Nunca tratamos eso como conversión exitosa — el llamador conserva el
  // original en vez de reemplazarlo por un mp4 roto.
  if (resultado.length < 1024) {
    throw new Error(`Conversión a mp4 produjo un archivo demasiado pequeño (${resultado.length} bytes)`)
  }

  console.log(`[video] Conversión OK: ${resultado.length} bytes`)
  return resultado
}

function intentarConversion(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart'])
      .output(output)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })
}
