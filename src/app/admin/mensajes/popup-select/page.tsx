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

        {/* ── Facebook Messenger ──────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-700" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.91 1.395 5.514 3.58 7.235V21l3.27-1.797c.874.241 1.8.371 2.76.371C17.523 19.574 22 15.43 22 10.33 22 5.232 17.523 2 12 2m1.194 11.305l-2.64-2.815-5.154 2.815 5.67-6.018 2.706 2.815 5.085-2.815-5.667 6.018z"/>
              </svg>
            </div>
            <p className="font-semibold text-gray-900 text-sm">Facebook Messenger</p>
            <span className="ml-auto text-xs text-gray-400">Opcional</span>
          </div>

          {pages.length === 0 ? (
            <p className="text-xs text-gray-400 pl-1">
              No se encontraron páginas de Facebook en tu cuenta.{' '}
              <span className="text-gray-500">Puedes conectarla después manualmente.</span>
            </p>
          ) : (
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${selPage === 'none' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="page" checked={selPage === 'none'}
                  onChange={() => setSelPage('none')} className="accent-blue-600" />
                <p className="text-sm text-gray-500">No conectar ahora</p>
              </label>
              {pages.map(pg => (
                <label key={pg.id} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${selPage !== 'none' && selPage?.id === pg.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="page" checked={selPage !== 'none' && selPage?.id === pg.id}
                    onChange={() => setSelPage(pg)} className="accent-blue-600" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{pg.name}</p>
                    <p className="text-xs text-gray-400">ID {pg.id}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ── Instagram ───────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-pink-600" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </div>
            <p className="font-semibold text-gray-900 text-sm">Instagram</p>
            <span className="ml-auto text-xs text-gray-400">Opcional</span>
          </div>

          {selPage === 'none' || !selPage ? (
            <p className="text-xs text-gray-400 pl-1">Selecciona una página de Facebook para ver su Instagram vinculado.</p>
          ) : !selectedIg ? (
            <p className="text-xs text-gray-400 pl-1">
              La página <span className="font-medium text-gray-600">{selPage.name}</span> no tiene Instagram profesional vinculado.
            </p>
          ) : (
            <div className="flex items-center gap-3 p-2.5 rounded-xl border-2 border-pink-400 bg-pink-50">
              <div className="w-7 h-7 bg-pink-200 rounded-full flex items-center justify-center text-sm font-bold text-pink-700">
                {(selectedIg.username ?? selectedIg.name ?? 'IG')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">@{selectedIg.username ?? selectedIg.name}</p>
                <p className="text-xs text-pink-600">Se conectará automáticamente</p>
              </div>
            </div>
          )}
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
