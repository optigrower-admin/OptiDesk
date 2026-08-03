import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

ffmpeg.setFfmpegPath(ffmpegPath as unknown as string)

const MAX_VIDEO_MB = 10
const TARGET_MB = 9          // un poco por debajo para tener margen
const AUDIO_KBPS = 128       // bitrate de audio fijo

/** Obtiene la duración en segundos de un archivo de video. */
function getDuracionSeg(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) reject(err)
      else resolve(meta.format.duration ?? 0)
    })
  })
}

/**
 * Convierte cualquier video a .mp4 H.264/AAC, garantizando que el
 * resultado pese menos de 10 MB. Calcula el bitrate de video necesario
 * a partir de la duración real del clip.
 */
export async function convertirAMp4(buffer: Buffer, extOriginal: string): Promise<Buffer> {
  const tmpDir = os.tmpdir()
  const id = crypto.randomUUID()
  const inputPath  = path.join(tmpDir, `${id}.${extOriginal || 'bin'}`)
  const outputPath = path.join(tmpDir, `${id}.mp4`)

  await fs.writeFile(inputPath, buffer)
  console.log(`[video] Convirtiendo ${inputPath} (${buffer.length} bytes) → mp4 <${MAX_VIDEO_MB}MB`)

  // Calcular bitrate de video para que el resultado quepa en TARGET_MB
  let videoBitrateKbps = 1500  // fallback si no se puede obtener duración
  try {
    const durSeg = await getDuracionSeg(inputPath)
    if (durSeg > 0) {
      const totalKbps = (TARGET_MB * 8 * 1024) / durSeg
      videoBitrateKbps = Math.max(150, Math.floor(totalKbps - AUDIO_KBPS))
      console.log(`[video] Duración: ${durSeg.toFixed(1)}s → bitrate video: ${videoBitrateKbps}kbps`)
    }
  } catch {
    console.warn('[video] No se pudo obtener duración, usando bitrate fijo.')
  }

  await convertirConBitrate(inputPath, outputPath, videoBitrateKbps)

  const resultado = await fs.readFile(outputPath)
  await Promise.all([
    fs.unlink(inputPath).catch(() => {}),
    fs.unlink(outputPath).catch(() => {}),
  ])

  if (resultado.length < 1024) {
    throw new Error(`Conversión a mp4 produjo un archivo demasiado pequeño (${resultado.length} bytes)`)
  }

  const tamMB = (resultado.length / 1024 / 1024).toFixed(1)
  console.log(`[video] Conversión OK: ${resultado.length} bytes (${tamMB} MB)`)

  // Si por algún motivo sigue pesando más de 10 MB (clip muy largo), forzar
  // un segundo pase con bitrate más agresivo.
  if (resultado.length > MAX_VIDEO_MB * 1024 * 1024) {
    console.warn(`[video] Resultado (${tamMB} MB) supera ${MAX_VIDEO_MB} MB — segundo pase más agresivo.`)
    const id2 = crypto.randomUUID()
    const in2  = path.join(tmpDir, `${id2}_in.mp4`)
    const out2 = path.join(tmpDir, `${id2}_out.mp4`)
    await fs.writeFile(in2, resultado)
    try {
      const durSeg2 = await getDuracionSeg(in2)
      const brate2 = durSeg2 > 0
        ? Math.max(100, Math.floor((TARGET_MB * 8 * 1024) / durSeg2 - AUDIO_KBPS))
        : Math.floor(videoBitrateKbps * 0.6)
      await convertirConBitrate(in2, out2, brate2)
      const resultado2 = await fs.readFile(out2)
      await Promise.all([fs.unlink(in2).catch(() => {}), fs.unlink(out2).catch(() => {})])
      if (resultado2.length >= 1024) {
        console.log(`[video] 2do pase OK: ${(resultado2.length / 1024 / 1024).toFixed(1)} MB`)
        return resultado2
      }
    } catch (e) {
      console.error('[video] Error en 2do pase, se conserva el primero:', e)
      await Promise.all([fs.unlink(in2).catch(() => {}), fs.unlink(out2).catch(() => {})])
    }
  }

  return resultado
}

function convertirConBitrate(input: string, output: string, videoBitrateKbps: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-b:v', `${videoBitrateKbps}k`,
        '-maxrate', `${Math.floor(videoBitrateKbps * 1.5)}k`,
        '-bufsize', `${videoBitrateKbps * 2}k`,
        '-c:a', 'aac',
        '-b:a', `${AUDIO_KBPS}k`,
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })
}
