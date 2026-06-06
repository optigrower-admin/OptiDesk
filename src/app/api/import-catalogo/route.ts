import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// Mapeo de columnas del Excel UMA (índice 0-based)
// Col E=4 código, F=5 descripción, I=8 subgrupo, N=13 precio_pub_iva,
// O=14 precio_pub_sin_iva, P=15 descuento, Q=16 precio_dist, S=18 unidad_empaque, T=19 modelos
const COL = { codigo: 4, descripcion: 5, subgrupo: 8, precio_publico_iva: 13, precio_publico_sin_iva: 14, descuento: 15, precio_distribuidor_sin_iva: 16, unidad_empaque: 18, modelos_aplicables: 19 }
const FILA_INICIO = 11 // índice 0-based (fila 12 en Excel)

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'control_total') {
    return NextResponse.json({ error: 'Solo control_total puede importar' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const tenantId = formData.get('tenant_id') as string

  if (!file || !tenantId) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false })

  const records: Record<string, unknown>[] = []

  for (let i = FILA_INICIO; i < rows.length; i++) {
    const row = rows[i]
    const codigo = String(row[COL.codigo] ?? '').trim()
    if (!codigo) continue

    const descripcion = String(row[COL.descripcion] ?? '').trim()
    if (!descripcion) continue

    const parseNum = (v: unknown) => {
      const s = String(v ?? '').replace(/[^0-9.,]/g, '').replace(',', '.')
      const n = parseFloat(s)
      return isNaN(n) ? null : n
    }

    records.push({
      tenant_id: tenantId,
      codigo,
      descripcion,
      subgrupo: String(row[COL.subgrupo] ?? '').trim() || null,
      precio_publico_iva: parseNum(row[COL.precio_publico_iva]),
      precio_publico_sin_iva: parseNum(row[COL.precio_publico_sin_iva]),
      descuento: parseNum(row[COL.descuento]),
      precio_distribuidor_sin_iva: parseNum(row[COL.precio_distribuidor_sin_iva]),
      unidad_empaque: parseInt(String(row[COL.unidad_empaque] ?? '1')) || 1,
      modelos_aplicables: String(row[COL.modelos_aplicables] ?? '').trim() || null,
    })
  }

  if (!records.length) return NextResponse.json({ error: 'No se encontraron datos en el archivo' }, { status: 400 })

  let insertados = 0

  // Upsert por lotes de 100
  const BATCH = 100
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { data, error } = await supabase.from('repuestos_uma')
      .upsert(batch, { onConflict: 'tenant_id,codigo', ignoreDuplicates: false })
      .select('id')

    if (error) console.error('Error upsert batch:', error.message)
    else insertados += data?.length ?? 0
  }

  return NextResponse.json({ insertados, total: records.length })
}
