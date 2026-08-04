import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPayload } from '@/lib/crypto'

// Endpoint público (protegido solo por el token firmado, no por sesión) —
// lo llama el userscript de Tampermonkey desde el dominio de Progreser, que
// no tiene ni puede tener las cookies de sesión de OptiDesk.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400, headers: CORS_HEADERS })

  const payload = verifyPayload<{ tenant_id: string; cliente_id: string; exp: number }>(token)
  if (!payload || payload.exp < Date.now()) {
    return NextResponse.json({ error: 'Token inválido o vencido — vuelve a OptiDesk y abre el enlace de nuevo.' }, { status: 401, headers: CORS_HEADERS })
  }

  const admin = createAdminClient()
  const { data: cliente } = await admin.from('clientes')
    .select('tipo_documento, cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, email, celular')
    .eq('id', payload.cliente_id).eq('tenant_id', payload.tenant_id).single()

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404, headers: CORS_HEADERS })

  return NextResponse.json({
    tipoDocumento: cliente.tipo_documento ?? 'CC',
    numeroDocumento: cliente.cedula,
    primerNombre: cliente.primer_nombre,
    segundoNombre: cliente.segundo_nombre,
    primerApellido: cliente.primer_apellido,
    segundoApellido: cliente.segundo_apellido,
    correo: cliente.email,
    celular: cliente.celular,
  }, { headers: CORS_HEADERS })
}
