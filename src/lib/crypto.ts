import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) throw new Error('ENCRYPTION_KEY no está configurada en las variables de entorno')
  return Buffer.from(keyHex, 'hex')
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':')
  if (!ivHex || !encryptedHex) throw new Error('Formato de token encriptado inválido')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** Firma un objeto en un token portable por URL (base64url payload + firma
 * HMAC), para autorizar una petición de un origen externo (ej. un userscript
 * corriendo en otro sitio) sin exponer ninguna credencial. */
export function signPayload(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const firma = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${firma}`
}

export function verifyPayload<T = Record<string, unknown>>(token: string): T | null {
  const [payloadB64, firma] = token.split('.')
  if (!payloadB64 || !firma) return null
  const esperada = crypto.createHmac('sha256', getKey()).update(payloadB64).digest('base64url')
  if (esperada.length !== firma.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(firma))) return null
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
