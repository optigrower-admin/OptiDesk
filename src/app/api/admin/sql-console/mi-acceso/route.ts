import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolverAcceso } from '@/lib/sqlConsole/permisos'
import { tablasPorModulo } from '@/lib/sqlConsole/whitelist'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const acceso = await resolverAcceso(supabase, perfil.tenant_id, user.id, perfil.rol)
  if (!acceso.puedeAcceder) {
    return NextResponse.json({ puedeAcceder: false })
  }

  const modulos = tablasPorModulo()
  const tablasVisibles = Object.fromEntries(
    Object.entries(modulos)
      .map(([modulo, tablas]) => [modulo, tablas.filter(t => acceso.tablasPermitidas.includes(t.tabla))])
      .filter(([, tablas]) => (tablas as unknown[]).length > 0),
  )

  return NextResponse.json({
    puedeAcceder: true,
    puedeExportar: acceso.puedeExportar,
    limiteFilasPreview: acceso.limiteFilasPreview,
    tablas: tablasVisibles,
    esGerencia: ['gerencia', 'control_total'].includes(perfil.rol),
  })
}
