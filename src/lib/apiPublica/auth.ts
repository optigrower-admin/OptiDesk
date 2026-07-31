import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export const API_KEY_PREFIX = 'opk_live_'

export interface ApiKeyContext {
  tenantId: string
  apiKeyId: string
  permisos: Record<string, { lectura?: boolean; escritura?: boolean }>
}

type ResultadoAuth = { ctx: ApiKeyContext } | { error: string; status: number }

export async function autenticarApiKey(req: Request): Promise<ResultadoAuth> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return { error: 'Falta el header Authorization: Bearer {api_key}', status: 401 }
  }
  const key = auth.slice('Bearer '.length).trim()
  if (!key.startsWith(API_KEY_PREFIX)) {
    return { error: 'API key inválida', status: 401 }
  }

  const prefix = key.slice(0, API_KEY_PREFIX.length + 8)
  const admin = createAdminClient()
  const { data: candidatos } = await admin
    .from('api_keys')
    .select('id, tenant_id, key_hash, permisos, activa, expira_en')
    .eq('key_prefix', prefix)

  if (!candidatos?.length) return { error: 'API key inválida', status: 401 }

  let match: (typeof candidatos)[number] | null = null
  for (const c of candidatos) {
    if (await bcrypt.compare(key, c.key_hash)) { match = c; break }
  }
  if (!match) return { error: 'API key inválida', status: 401 }
  if (!match.activa) return { error: 'API key revocada', status: 401 }
  if (match.expira_en && new Date(match.expira_en) < new Date()) {
    return { error: 'API key expirada', status: 401 }
  }

  admin.from('api_keys').update({ ultimo_uso: new Date().toISOString() }).eq('id', match.id).then(() => {})

  return {
    ctx: {
      tenantId: match.tenant_id,
      apiKeyId: match.id,
      permisos: (match.permisos ?? {}) as ApiKeyContext['permisos'],
    },
  }
}

export function tienePermisoRecurso(
  permisos: ApiKeyContext['permisos'],
  recurso: string,
  accion: 'lectura' | 'escritura',
): boolean {
  return !!permisos?.[recurso]?.[accion]
}

export async function logApiRequest(apiKeyId: string, endpoint: string, metodo: string, statusCode: number, ip: string | null) {
  const admin = createAdminClient()
  await admin.from('api_request_logs').insert({
    api_key_id: apiKeyId, endpoint, metodo, status_code: statusCode, ip_origen: ip,
  })
}

export async function excedeRateLimit(apiKeyId: string): Promise<boolean> {
  const admin = createAdminClient()
  const haceUnMinuto = new Date(Date.now() - 60_000).toISOString()
  const { count } = await admin
    .from('api_request_logs')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', haceUnMinuto)
  return (count ?? 0) >= 100
}

/** Genera una API key nueva: "opk_live_" + 32 caracteres hex aleatorios. */
export function generarApiKey(): { key: string; prefix: string } {
  const random = crypto.randomBytes(16).toString('hex')
  const key = `${API_KEY_PREFIX}${random}`
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 8) }
}
