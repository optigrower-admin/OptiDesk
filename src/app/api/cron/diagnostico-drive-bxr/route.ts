import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { google } from 'googleapis'

export const runtime = 'nodejs'

const TENANT_ID = 'f9126ff6-0fdf-4a62-a61b-ff07c60652a5'

function getAuthClient(oauthRefreshToken?: string | null) {
  if (oauthRefreshToken && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    const client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    client.setCredentials({ refresh_token: oauthRefreshToken })
    return client
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('Sin credenciales de Drive configuradas.')
  const key = JSON.parse(raw)
  return new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/drive'] })
}

// Diagnóstico temporal, un solo uso — se elimina después de usarlo.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants')
    .select('google_refresh_token, drive_folder_id').eq('id', TENANT_ID).single()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const auth = getAuthClient(tenant.google_refresh_token)
  const drive = google.drive({ version: 'v3', auth: auth as any })

  const folderRaw = tenant.drive_folder_id as string
  const parentId = folderRaw.includes('/') ? (folderRaw.split('/folders/')[1]?.split('?')[0] ?? folderRaw) : folderRaw

  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and (name='BXR16H' or name='BXR18H')`
  const foldersRes = await drive.files.list({ q, fields: 'files(id,name,createdTime)' })
  const carpetas = foldersRes.data.files ?? []

  const carpetasConArchivos = []
  for (const f of carpetas) {
    const filesRes = await drive.files.list({
      q: `'${f.id}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,createdTime)',
      pageSize: 200,
    })
    carpetasConArchivos.push({ carpeta: f, archivos: filesRes.data.files ?? [] })
  }

  const { data: ordenes } = await admin.from('ordenes')
    .select('id, numero, placa, drive_folder_id, created_at')
    .eq('tenant_id', TENANT_ID)
    .in('placa', ['BXR16H', 'BXR18H'])

  const ordenIds = (ordenes ?? []).map((o: { id: string }) => o.id)
  let medios: unknown[] = []
  if (ordenIds.length) {
    const { data } = await admin.from('medios')
      .select('id, orden_id, url, tipo, nombre_archivo, storage_location, created_at')
      .in('orden_id', ordenIds)
    medios = data ?? []
  }

  return NextResponse.json({ carpetasConArchivos, ordenes, medios }, { status: 200 })
}

// Fix puntual, un solo uso: la orden #308 se corrigió a placa BXR16H por
// error (en realidad es BXR18H) y eso disparó el rename de su carpeta,
// chocando con la carpeta BXR16H real de otras órdenes. Revierte la placa
// y renombra su carpeta de vuelta a BXR18H, sin tocar la otra carpeta.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const ORDEN_308_ID = 'b4bf6097-96fa-4dcf-a996-10537650af14'
  const CARPETA_DUPLICADA_ID = '15SVYs7G4FJmo-QdxLvQzvPt2P2f0GcCj'

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants')
    .select('google_refresh_token').eq('id', TENANT_ID).single()
  if (!tenant?.google_refresh_token) return NextResponse.json({ error: 'Sin token de Drive' }, { status: 400 })

  const auth = getAuthClient(tenant.google_refresh_token)
  const drive = google.drive({ version: 'v3', auth: auth as any })

  await drive.files.update({ fileId: CARPETA_DUPLICADA_ID, requestBody: { name: 'BXR18H' } })

  const { error: updErr } = await admin.from('ordenes')
    .update({ placa: 'BXR18H' }).eq('id', ORDEN_308_ID)

  return NextResponse.json({ ok: true, carpetaRenombrada: 'BXR18H', placaActualizada: !updErr, updErr })
}
