import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) return NextResponse.json({ error: 'Web Push no configurado' }, { status: 503 })
  return NextResponse.json({ publicKey: key })
}
