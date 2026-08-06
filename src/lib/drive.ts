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

export async function downloadFromDrive(
  fileId: string,
  oauthRefreshToken?: string | null,
): Promise<Buffer> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

/** Reemplaza el contenido de un archivo de Drive ya existente, manteniendo el
 * mismo fileId (y por lo tanto el mismo webViewLink) — para reoptimizar
 * archivos sin romper ninguna referencia ya guardada. */
export async function replaceDriveFileContent(
  fileId: string,
  mimeType: string,
  buffer: Buffer,
  oauthRefreshToken?: string | null,
): Promise<void> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.update({
    fileId,
    media: { mimeType, body: Readable.from(buffer) },
  })
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

export async function renameDriveFolder(
  folderId: string,
  newName: string,
  oauthRefreshToken?: string | null,
): Promise<void> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.update({
    fileId: folderId,
    requestBody: { name: newName },
  })
}

export async function listDriveFolderFiles(
  folderId: string,
  oauthRefreshToken?: string | null,
): Promise<{ id: string; name: string; size?: string; mimeType?: string; createdTime?: string }[]> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, size, mimeType, createdTime)',
    pageSize: 200,
  })
  return (res.data.files ?? []) as { id: string; name: string; size?: string; mimeType?: string; createdTime?: string }[]
}

export async function deleteFromDrive(
  fileId: string,
  oauthRefreshToken?: string | null,
): Promise<void> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId })
}

/** Mueve una carpeta/archivo a la papelera (reversible) en vez de borrarlo
 * permanentemente — usado para limpiar carpetas duplicadas creadas por una
 * condición de carrera al subir varios archivos a la vez a una orden nueva. */
export async function trashDriveFile(
  fileId: string,
  oauthRefreshToken?: string | null,
): Promise<void> {
  const auth = getAuthClient(oauthRefreshToken)
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.update({ fileId, requestBody: { trashed: true } })
}
