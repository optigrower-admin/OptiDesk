import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const maxDuration = 60 // catálogos grandes pueden tardar más que el límite por defecto

// Columnas del Excel (índice 0-based, hoja "Lista de Precios", datos desde fila 13)
// col3 = Referencia (D), col4 = Descripción (E), col5 = Modelo Aplicable (F)
// col7 = Precio público con IVA (H), col8 = Precio público sin IVA (I)
// col12 = Unidad Empaque (M)
const COL = {
  codigo: 3,
  descripcion: 4,
  modelos: 5,
  precio_con_iva: 7,
  precio_sin_iva: 8,
  unidad_empaque: 12,
}
const FILA_INICIO = 12 // 0-based (fila 13 en Excel)

function calcularSubgrupo(descripcion: string): string {
  const palabras = descripcion.trim().split(/\s+/).filter(Boolean)
  if (palabras.length >= 2) return `${palabras[0]} ${palabras[1]}`
  return palabras[0] ?? ''
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!perfil || !['control_total', 'gerencia', 'admin'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permiso para importar catálogo' }, { status: 403 })
  }

  const tenantId = perfil.tenant_id as string
  if (!tenantId) return NextResponse.json({ error: 'Sin tenant asociado' }, { status: 400 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
  const modo = String(formData.get('modo') ?? 'agregar')

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false })

  // Usar la hoja "Lista de Precios" o la primera disponible
  const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('precio'))
    ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })

  const records: Record<string, unknown>[] = []

  for (let i = FILA_INICIO; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const codigo = String(row[COL.codigo] ?? '').trim()
    if (!codigo) continue

    const descripcion = String(row[COL.descripcion] ?? '').trim()
    if (!descripcion) continue

    const rawConIva = row[COL.precio_con_iva]
    const precioConIva = typeof rawConIva === 'number'
      ? rawConIva
      : parseFloat(String(rawConIva ?? '').replace(/[^0-9.]/g, ''))

    if (isNaN(precioConIva) || precioConIva <= 0) continue

    const rawSinIva = row[COL.precio_sin_iva]
    const precioSinIva = typeof rawSinIva === 'number'
      ? rawSinIva
      : parseFloat(String(rawSinIva ?? '').replace(/[^0-9.]/g, ''))

    const rawUE = row[COL.unidad_empaque]
    const unidadEmpaque = typeof rawUE === 'number'
      ? rawUE
      : parseInt(String(rawUE ?? '1'), 10)

    records.push({
      tenant_id: tenantId,
      codigo,
      tipo: 'lubricante',
      descripcion,
      subgrupo: calcularSubgrupo(descripcion) || null,
      precio_publico_iva: precioConIva,
      precio_publico_sin_iva: precioSinIva,
      unidad_empaque: isNaN(unidadEmpaque) ? 1 : unidadEmpaque,
      modelos_aplicables: String(row[COL.modelos] ?? '').trim() || null,
      activo: true,
    })
  }

  if (!records.length) {
    return NextResponse.json({ error: 'No se encontraron datos válidos en el archivo' }, { status: 400 })
  }

  // Deduplicar por código — el Excel puede tener referencias repetidas; quedarse con la última
  const deduped = Array.from(
    records.reduce((map, r) => map.set(r.codigo as string, r), new Map<string, Record<string, unknown>>()).values()
  )

  if (modo === 'reemplazar') {
    const { error: delError } = await supabase
      .from('repuestos_uma')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('tipo', 'lubricante')
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 })
    }
  }

  let insertados = 0
  const BATCH = 1500
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('repuestos_uma')
      .upsert(batch, { onConflict: 'tenant_id,codigo,tipo', ignoreDuplicates: false })
      .select('id')

    if (error) {
      console.error(`Error batch ${i / BATCH}:`, error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    insertados += data?.length ?? 0
  }

  return NextResponse.json({
    insertados,
    total: deduped.length,
    duplicados: records.length - deduped.length,
  })
}
