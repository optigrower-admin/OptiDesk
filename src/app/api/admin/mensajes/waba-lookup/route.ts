import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type PhoneEntry = {
  id: string
  display_phone_number: string
  verified_name: string
  waba_id: string
  waba_name: string
}

// POST { biz_id: string, token: string }
// Acepta: ID de Business Manager O ID de WABA directamente
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { biz_id, token } = await request.json()
  if (!biz_id?.trim() || !token) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const id = biz_id.trim()

  // Intentar como Business Manager → buscar WABAs
  const r1 = await fetch(
    `https://graph.facebook.com/v20.0/${id}/whatsapp_business_accounts?access_token=${token}&fields=id,name&limit=50`
  )
  const d1 = await r1.json()
  console.log(`[waba-lookup] BM ${id} WABAs:`, JSON.stringify(d1))

  if (!d1.error && d1.data) {
    const phones: PhoneEntry[] = []
    for (const waba of d1.data) {
      const pr = await fetch(
        `https://graph.facebook.com/v20.0/${waba.id}/phone_numbers?access_token=${token}&fields=id,display_phone_number,verified_name&limit=50`
      )
      const pd = await pr.json()
      for (const p of (pd.data ?? [])) {
        phones.push({
          id:                   p.id,
          display_phone_number: p.display_phone_number,
          verified_name:        p.verified_name ?? '',
          waba_id:              waba.id,
          waba_name:            waba.name || `WABA ${waba.id}`,
        })
      }
    }
    if (phones.length > 0 || d1.data.length > 0) return NextResponse.json({ phones })
  }

  // Intentar como WABA ID directamente → buscar números
  const r2 = await fetch(
    `https://graph.facebook.com/v20.0/${id}/phone_numbers?access_token=${token}&fields=id,display_phone_number,verified_name&limit=50`
  )
  const d2 = await r2.json()
  console.log(`[waba-lookup] WABA ${id} números:`, JSON.stringify(d2))

  if (!d2.error && d2.data) {
    const phones: PhoneEntry[] = (d2.data ?? []).map((p: { id: string; display_phone_number: string; verified_name?: string }) => ({
      id:                   p.id,
      display_phone_number: p.display_phone_number,
      verified_name:        p.verified_name ?? '',
      waba_id:              id,
      waba_name:            `WABA ${id}`,
    }))
    return NextResponse.json({ phones })
  }

  const msg = d1.error?.message ?? d2.error?.message ?? 'ID no encontrado o sin acceso'
  return NextResponse.json({ error: msg }, { status: 400 })
}
