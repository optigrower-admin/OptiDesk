import { google } from 'googleapis'
import { Readable } from 'stream'

/**
 * Crea el cliente de autenticación.
 * Prioridad:
 *  1. OAuth2 con refresh token del usuario (funciona con Drive personal)
 *  2. Service account (solo Shared Drives / Google Workspace — no soporta Drive personal)
 */
function getAuthClient(oauthRefreshToken?: string | null) {
  if (
    oauthRefreshToken &&
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  ) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    )
    client.setCredentials({ refresh_token: oauthRefreshToken })
    return client
  }

  // Fallback: service account (require Shared Drive o Google Workspace)
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('Ni GOOGLE_OAUTH_REFRESH_TOKEN ni GOOGLE_SERVICE_ACCOUNT_KEY están configuradas.')
  const key = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

export async function uploadToDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  parentFolderId: string,
  oauthRefreshToken?: string | null,
): Promise<{ id: string; webViewLink: string }> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [parentFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
  })

  if (!response.data.id) throw new Error('Drive: no se recibió ID del archivo')

  // Hacer el archivo legible por cualquiera con el link
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return {
    id: response.data.id,
    webViewLink:
      response.data.webViewLink ??
      `https://drive.google.com/file/d/${response.data.id}/view`,
  }
}

export async function getOrCreateDriveSubfolder(
  parentId: string,
  folderName: string,
  oauthRefreshToken?: string | null,
): Promise<string> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })

  const q = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const existing = await drive.files.list({ q, fields: 'files(id)' })

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })

  return created.data.id!
}
