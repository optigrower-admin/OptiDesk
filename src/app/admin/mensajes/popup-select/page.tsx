'use client'
import { useState, useEffect } from 'react'

type PhoneEntry = {
  id: string
  display_phone_number: string
  verified_name: string
  waba_id: string
  waba_name: string
}

export default function PopupSelectPage() {
  const [phones,   setPhones]   = useState<PhoneEntry[]>([])
  const [token,    setToken]    = useState('')
  const [selected, setSelected] = useState<PhoneEntry | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    try {
      const ph = JSON.parse(decodeURIComponent(p.get('phones') ?? '[]')) as PhoneEntry[]
      setPhones(ph)
      setSelected(ph[0] ?? null)
    } catch { setError('Error al cargar los datos') }
    setToken(p.get('token') ?? '')
  }, [])

  // Agrupar por WABA
  const groups = phones.reduce<Record<string, PhoneEntry[]>>((acc, ph) => {
    const key = ph.waba_name || ph.waba_id
    if (!acc[key]) acc[key] = []
    acc[key].push(ph)
    return acc
  }, {})

  const confirmar = async () => {
    if (!selected) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/mensajes/embedded-signup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waba_id:         selected.waba_id,
          phone_number_id: selected.id,
          phone_number:    selected.display_phone_number,
          verified_name:   selected.verified_name,
          access_token:    token,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (window.opener) {
        window.opener.postMessage({
          type: 'META_OAUTH_COMPLETE', success: true,
          phone: selected.display_phone_number,
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
          <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-green-700" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.49"/>
            </svg>
          </div>
          <h2 className="font-bold text-gray-900 text-lg">Selecciona tu número</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {phones.length} número{phones.length !== 1 ? 's' : ''} encontrado{phones.length !== 1 ? 's' : ''}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* Lista de números agrupados por cuenta */}
        <div className="space-y-3">
          {Object.entries(groups).map(([groupName, groupPhones]) => (
            <div key={groupName} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {/* Cabecera del grupo */}
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gray-400" fill="currentColor">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8"/>
                </svg>
                <span className="text-xs font-semibold text-gray-500 truncate">{groupName}</span>
                <span className="ml-auto text-xs text-gray-400 flex-shrink-0">{groupPhones.length} nº</span>
              </div>

              {/* Números del grupo */}
              <div className="divide-y divide-gray-100">
                {groupPhones.map(ph => (
                  <label
                    key={ph.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      selected?.id === ph.id ? 'bg-green-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      selected?.id === ph.id ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}>
                      {selected?.id === ph.id && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      )}
                    </div>
                    <input type="radio" name="phone" className="sr-only"
                      checked={selected?.id === ph.id} onChange={() => setSelected(ph)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{ph.display_phone_number}</p>
                      {ph.verified_name && (
                        <p className="text-xs text-gray-400 truncate">{ph.verified_name}</p>
                      )}
                    </div>
                    {selected?.id === ph.id && (
                      <span className="text-xs font-medium text-green-600 flex-shrink-0">Seleccionado</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Próximamente */}
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Próximamente</p>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>💬 Messenger</span>
            <span>📸 Instagram</span>
          </div>
        </div>

        {/* Botón */}
        <button
          onClick={confirmar}
          disabled={!selected || saving}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {saving ? 'Conectando...' : `Conectar ${selected?.display_phone_number ?? ''}`}
        </button>
      </div>
    </div>
  )
}
