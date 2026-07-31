import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { ejecutarExport } from '@/lib/db/pgExport'
import { uploadToR2 } from '@/lib/r2'
import { stringify } from 'csv-stringify/sync'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function generarArchivo(formato: string, columnas: string[], filas: Record<string, unknown>[]): { buffer: Buffer; contentType: string } {
  if (formato === 'csv') {
    const csv = stringify(filas, { header: true, columns: columnas })
    return { buffer: Buffer.from(csv, 'utf-8'), contentType: 'text/csv' }
  }
  if (formato === 'txt') {
    const txt = stringify(filas, { header: true, columns: columnas, delimiter: '\t' })
    return { buffer: Buffer.from(txt, 'utf-8'), contentType: 'text/plain' }
  }
  if (formato === 'json') {
    return { buffer: Buffer.from(JSON.stringify(filas, null, 2), 'utf-8'), contentType: 'application/json' }
  }
  // xlsx
  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas })
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Resultado')
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return { buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { jobId } = await req.json()
  if (!jobId) return NextResponse.json({ error: 'Falta "jobId"' }, { status: 400 })

  const admin = createAdminClient()
  const { data: job } = await admin.from('export_jobs').select('*').eq('id', jobId).single()
  if (!job || job.usuario_id !== user.id) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  if (job.status !== 'PENDIENTE') {
    return NextResponse.json({ ok: true, yaProcesado: true })
  }

  await admin.from('export_jobs').update({ status: 'PROCESANDO' }).eq('id', jobId)

  try {
    const resultado = await ejecutarExport(user.id, job.query_text)
    const columnas = resultado.fields.map(f => f.name)
    const { buffer, contentType } = generarArchivo(job.formato, columnas, resultado.rows)

    const key = `sql-console-exports/${job.tenant_id}/${job.id}.${job.formato}`
    await uploadToR2(key, buffer, contentType)

    await admin.from('export_jobs').update({
      status: 'LISTO',
      archivo_url: key,
      filas_totales: resultado.rowCount ?? 0,
      completado_at: new Date().toISOString(),
    }).eq('id', jobId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error generando la exportación'
    await admin.from('export_jobs').update({
      status: 'ERROR', error_mensaje: mensaje, completado_at: new Date().toISOString(),
    }).eq('id', jobId)
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
