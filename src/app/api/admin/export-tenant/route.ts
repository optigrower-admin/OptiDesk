import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

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

  const admin = createAdminClient()

  const [
    { data: clientes },
    { data: motos },
    { data: ordenes },
    { data: repuestos },
    { data: movimientos },
  ] = await Promise.all([
    admin.from('clientes').select('*').eq('tenant_id', tenant_id),
    admin.from('motos').select('*').eq('tenant_id', tenant_id),
    admin.from('ordenes').select('*').eq('tenant_id', tenant_id),
    admin.from('repuestos_externos').select('*').eq('tenant_id', tenant_id),
    admin.from('movimientos_inventario').select('*').eq('tenant_id', tenant_id),
  ])

  const ordenIds = (ordenes ?? []).map((o: { id: string }) => o.id)
  const { data: items } = ordenIds.length > 0
    ? await admin.from('items_orden').select('*').in('orden_id', ordenIds)
    : { data: [] }

  const wb = XLSX.utils.book_new()

  const addSheet = (name: string, data: Record<string, unknown>[] | null | undefined) => {
    const ws = XLSX.utils.json_to_sheet(data && data.length > 0 ? data as Record<string, unknown>[] : [])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet('Clientes', clientes as Record<string, unknown>[])
  addSheet('Motos', motos as Record<string, unknown>[])
  addSheet('Ordenes', ordenes as Record<string, unknown>[])
  addSheet('Items de Ordenes', items as Record<string, unknown>[])
  addSheet('Repuestos', repuestos as Record<string, unknown>[])
  addSheet('Movimientos', movimientos as Record<string, unknown>[])

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const fecha = new Date().toISOString().split('T')[0]
  const nombreArchivo = `respaldo_${tenant.nombre.replace(/\s+/g, '_')}_${fecha}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
