'use client'
import { useState, useEffect } from 'react'

type Phone    = { id: string; display_phone_number: string; verified_name: string }
type IgAcct   = { id: string; name?: string; username?: string }
type Page     = { id: string; name: string; access_token: string; instagram: IgAcct | null }

export default function PopupSelectPage() {
  const [phones, setPhones]       = useState<Phone[]>([])
  const [pages,  setPages]        = useState<Page[]>([])
  const [wabaId, setWabaId]       = useState('')
  const [token,  setToken]        = useState('')
  const [wabaName, setWabaName]   = useState('')

  const [selPhone, setSelPhone]   = useState<Phone | null>(null)
  const [selPage,  setSelPage]    = useState<Page | null | 'none'>('none')
  const [saving,   setSaving]     = useState(false)
  const [error,    setError]      = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    try {
      const ph = JSON.parse(decodeURIComponent(p.get('phones') ?? '[]')) as Phone[]
      setPhones(ph)
      setSelPhone(ph[0] ?? null)
    } catch { setError('Error al cargar números') }
    try {
      const pg = JSON.parse(decodeURIComponent(p.get('pages') ?? '[]')) as Page[]
      setPages(pg)
    } catch { /* sin páginas */ }
    setWabaId(p.get('waba_id') ?? '')
    setWabaName(decodeURIComponent(p.get('waba_name') ?? ''))
    setToken(p.get('token') ?? '')
  }, [])

  const selectedIg = selPage && selPage !== 'none' ? selPage.instagram : null

  const confirmar = async () => {
    if (!selPhone) return
    setSaving(true); setError('')
    try {
      const body: Record<string, string | null> = {
        waba_id:         wabaId,
        phone_number_id: selPhone.id,
        phone_number:    selPhone.display_phone_number,
        verified_name:   selPhone.verified_name,
        access_token:    token,
        page_id:         selPage && selPage !== 'none' ? selPage.id        : null,
        page_token:      selPage && selPage !== 'none' ? selPage.access_token : null,
        instagram_id:    selectedIg?.id ?? null,
      }
      const res  = await fetch('/api/admin/mensajes/embedded-signup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (window.opener) {
        window.opener.postMessage({
          type: 'META_OAUTH_COMPLETE', success: true,
          phone: selPhone.display_phone_number,
        }, window.location.origin)
        setTimeout(() => window.close(), 1500)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-6">
      <div className="max-w-sm w-full space-y-3">

        {/* Header */}
        <div className="text-center pb-1">
          <h2 className="font-bold text-gray-900 text-lg">Confirma tu conexión</h2>
          {wabaName && <p className="text-xs text-gray-400 mt-0.5">{wabaName}</p>}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* ── WhatsApp ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-green-700" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.49"/>
              </svg>
            </div>
            <p className="font-semibold text-gray-900 text-sm">WhatsApp Business</p>
            <span className="ml-auto text-xs text-red-500 font-medium">Requerido</span>
          </div>
          <div className="space-y-2">
            {phones.map(ph => (
              <label key={ph.id} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${selPhone?.id === ph.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="phone" checked={selPhone?.id === ph.id}
                  onChange={() => setSelPhone(ph)} className="accent-green-600" />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{ph.display_phone_number}</p>
                  <p className="text-xs text-gray-400">{ph.verified_name}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Próximamente ─────────────────────────────────────────── */}
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Próximamente</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">💬</span>
            <p className="text-sm text-gray-500">Facebook Messenger</p>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📸</span>
            <p className="text-sm text-gray-500">Instagram Direct</p>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Estos canales se habilitarán en una próxima actualización. Por ahora conecta tu WhatsApp y podrás agregar los demás desde la configuración.
          </p>
        </div>

        {/* ── Botón confirmar ──────────────────────────────────────── */}
        <button
          onClick={confirmar}
          disabled={!selPhone || saving}
          className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {saving ? 'Conectando...' : 'Confirmar y conectar'}
        </button>
      </div>
    </div>
  )
}
