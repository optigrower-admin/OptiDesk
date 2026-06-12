'use client'
import { useState, useEffect } from 'react'

type PageEntry = {
  id: string
  name: string
  access_token: string
}

export default function PopupSelectPagesPage() {
  const [pages,    setPages]    = useState<PageEntry[]>([])
  const [selected, setSelected] = useState<PageEntry | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    try {
      const parsed = JSON.parse(decodeURIComponent(p.get('pages') ?? '[]')) as PageEntry[]
      setPages(parsed)
      if (parsed.length === 1) setSelected(parsed[0])
    } catch { /* vacío */ }
  }, [])

  const confirmar = async () => {
    if (!selected) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/mensajes/guardar-messenger-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: selected.id, page_name: selected.name, page_token: selected.access_token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      if (window.opener) {
        window.opener.postMessage(
          { type: 'META_OAUTH_COMPLETE', success: true, detail: selected.name, channel: 'messenger' },
          window.location.origin
        )
        setTimeout(() => window.close(), 1500)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al conectar')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-6">
      <div className="max-w-sm w-full space-y-3">

        <div className="text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-700" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.91 1.395 5.514 3.58 7.235V21l3.27-1.797c.874.241 1.8.371 2.76.371C17.523 19.574 22 15.43 22 10.33 22 5.232 17.523 2 12 2m1.194 11.305l-2.64-2.815-5.154 2.815 5.67-6.018 2.706 2.815 5.085-2.815-5.667 6.018z"/>
            </svg>
          </div>
          <h2 className="font-bold text-gray-900">Selecciona tu página</h2>
          <p className="text-xs text-gray-400 mt-0.5">{pages.length} página{pages.length !== 1 ? 's' : ''} encontrada{pages.length !== 1 ? 's' : ''}</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-1.5">
          {pages.map(pg => (
            <button
              key={pg.id}
              onClick={() => setSelected(pg)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                selected?.id === pg.id
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-white border-gray-200 hover:border-blue-200'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                selected?.id === pg.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
              }`}>
                {selected?.id === pg.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{pg.name}</p>
                <p className="text-xs text-gray-400 font-mono">{pg.id}</p>
              </div>
              {selected?.id === pg.id && <span className="text-xs font-medium text-blue-600">✓</span>}
            </button>
          ))}
        </div>

        <button
          onClick={confirmar}
          disabled={!selected || saving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {saving     ? 'Conectando...'
           : selected ? `Conectar "${selected.name}"`
           :            'Selecciona una página'}
        </button>
      </div>
    </div>
  )
}
