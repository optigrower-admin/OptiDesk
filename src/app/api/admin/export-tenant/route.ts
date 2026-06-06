import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

const LIMIT = 100000 // tope de filas por tabla

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'control_total') {
    return NextResponse.json({ error: 'Solo control_total puede ejecutar esta acción' }, { status: 403 })
  }

  const { tenant_id } = await req.json()
  if (!tenant_id) return NextResponse.json({ error: 'Falta tenant_id' }, { status: 400 })

  const { data: tenant } = await supabase.from('tenants').select('nombre').eq('id', tenant_id).single()
  if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  // Usar supabase (cliente autenticado como control_total) en vez de admin:
  // las políticas RLS ya permiten control_total ver todos los datos.
  const [
    { data: clientes,    error: eC },
    { data: motos,       error: eM },
    { data: ordenes,     error: eO },
    { data: repuestos,   error: eR },
    { data: movimientos, error: eMv },
    { data: proveedores, error: ePr },
  ] = await Promise.all([
    supabase.from('clientes').select('*').eq('tenant_id', tenant_id).limit(LIMIT),
    supabase.from('motos').select('*').eq('tenant_id', tenant_id).limit(LIMIT),
    supabase.from('ordenes').select('*').eq('tenant_id', tenant_id).limit(LIMIT),
    supabase.from('repuestos_externos').select('*').eq('tenant_id', tenant_id).limit(LIMIT),
    supabase.from('movimientos_inventario').select('*').eq('tenant_id', tenant_id).limit(LIMIT),
    supabase.from('proveedores').select('*').eq('tenant_id', tenant_id).limit(LIMIT),
  ])

  const errores = [
    eC  && `clientes: ${eC.message}`,
    eM  && `motos: ${eM.message}`,
    eO  && `ordenes: ${eO.message}`,
    eR  && `repuestos_externos: ${eR.message}`,
    eMv && `movimientos_inventario: ${eMv.message}`,
    ePr && `proveedores: ${ePr.message}`,
  ].filter(Boolean)

  if (errores.length > 0) {
    return NextResponse.json({ error: `Error leyendo datos: ${errores.join(' | ')}` }, { status: 500 })
  }

  // items_orden: paginar en chunks de 500 IDs para no superar límites de URL
  const ordenIds = (ordenes ?? []).map((o: { id: string }) => o.id)
  let items: Record<string, unknown>[] = []
  const CHUNK = 500
  for (let i = 0; i < ordenIds.length; i += CHUNK) {
    const chunk = ordenIds.slice(i, i + CHUNK)
    const { data: chunkItems, error: eI } = await supabase
      .from('items_orden')
      .select('*')
      .in('orden_id', chunk)
      .limit(LIMIT)
    if (eI) return NextResponse.json({ error: `items_orden: ${eI.message}` }, { status: 500 })
    if (chunkItems) items = items.concat(chunkItems as Record<string, unknown>[])
  }

  // Convertir a CSV con xlsx
  const toCSV = (data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return ''
    const ws = XLSX.utils.json_to_sheet(data)
    return XLSX.utils.sheet_to_csv(ws)
  }

  const tablas: { nombre: string; data: Record<string, unknown>[] }[] = [
    { nombre: 'clientes',               data: (clientes    ?? []) as Record<string, unknown>[] },
    { nombre: 'motos',                  data: (motos       ?? []) as Record<string, unknown>[] },
    { nombre: 'ordenes',                data: (ordenes     ?? []) as Record<string, unknown>[] },
    { nombre: 'items_ordenes',          data: items },
    { nombre: 'repuestos_externos',     data: (repuestos   ?? []) as Record<string, unknown>[] },
    { nombre: 'movimientos_inventario', data: (movimientos ?? []) as Record<string, unknown>[] },
    { nombre: 'proveedores',            data: (proveedores ?? []) as Record<string, unknown>[] },
  ]

  // Crear ZIP con una carpeta por respaldo
  const fecha = new Date().toISOString().split('T')[0]
  const nombreBase = `respaldo_${tenant.nombre.replace(/\s+/g, '_')}_${fecha}`
  const zip = new JSZip()
  const carpeta = zip.folder(nombreBase)!

  for (const tabla of tablas) {
    carpeta.file(`${tabla.nombre}.csv`, toCSV(tabla.data))
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nombreBase}.zip"`,
    },
  })
}
