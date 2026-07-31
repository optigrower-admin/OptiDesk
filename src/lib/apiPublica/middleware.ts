import { NextRequest, NextResponse } from 'next/server'
import { autenticarApiKey, tienePermisoRecurso, logApiRequest, excedeRateLimit, ApiKeyContext } from './auth'

/**
 * Envuelve un handler de /api/v1/* con: autenticación por API key,
 * verificación de permiso (recurso + lectura/escritura), rate limit
 * (100 solicitudes/min por key) y logging en api_request_logs.
 */
export async function conApiKey(
  req: NextRequest,
  recurso: string,
  accion: 'lectura' | 'escritura',
  handler: (ctx: ApiKeyContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const resultado = await autenticarApiKey(req)
  if ('error' in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }
  const { ctx } = resultado
  const endpoint = new URL(req.url).pathname
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  if (await excedeRateLimit(ctx.apiKeyId)) {
    await logApiRequest(ctx.apiKeyId, endpoint, req.method, 429, ip)
    return NextResponse.json({ error: 'Límite de 100 solicitudes por minuto excedido' }, { status: 429 })
  }

  if (!tienePermisoRecurso(ctx.permisos, recurso, accion)) {
    await logApiRequest(ctx.apiKeyId, endpoint, req.method, 403, ip)
    return NextResponse.json({ error: `Esta API key no tiene permiso de ${accion} sobre "${recurso}"` }, { status: 403 })
  }

  try {
    const res = await handler(ctx)
    await logApiRequest(ctx.apiKeyId, endpoint, req.method, res.status, ip)
    return res
  } catch {
    await logApiRequest(ctx.apiKeyId, endpoint, req.method, 500, ip)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
