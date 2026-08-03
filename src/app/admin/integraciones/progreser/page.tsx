'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'

export default function IntegracionProgreserPage() {
  const [usuarioActual, setUsuarioActual] = useState<string | null>(null)
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [loading, setLoading] = useState(true)

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/integraciones/progreser')
    const result = await r.json()
    setUsuarioActual(result.usuario ?? null)
    setPuedeEditar(!!result.puedeEditar)
    setUsuario(result.usuario ?? '')
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!usuario.trim() || !password.trim()) { setMensaje('Escribe usuario y contraseña.'); return }
    setGuardando(true); setMensaje('')
    const r = await fetch('/api/admin/integraciones/progreser', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password }),
    })
    const result = await r.json()
    setGuardando(false)
    if (!r.ok) { setMensaje(result.error ?? 'Error al guardar'); return }
    setPassword('')
    setMensaje('✓ Guardado correctamente.')
    cargar()
  }

  if (loading) return <div className="max-w-lg mx-auto p-6"><div className="h-32 bg-gray-100 rounded-xl animate-pulse" /></div>

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-bold text-gray-900">Progreser</h1>
      <p className="text-sm text-gray-500 mt-1">
        Usuario y contraseña de <a href="https://sipresplus-cloud.progreser.com/login" target="_blank" rel="noreferrer" className="text-blue-600 underline">sipresplus-cloud.progreser.com</a>, para que el botón &quot;Enviar a Progreser&quot; en la ficha del cliente pueda iniciar sesión y llenar el formulario automáticamente. Se guarda cifrado, nunca en texto plano.
      </p>

      {!puedeEditar ? (
        <p className="mt-6 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">Solo gerencia puede ver y configurar esto.</p>
      ) : (
        <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Usuario</label>
            <input value={usuario} onChange={e => setUsuario(e.target.value)}
              placeholder={usuarioActual ? undefined : 'Ej: DJPGUERREROL'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Contraseña</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password"
              placeholder={usuarioActual ? '•••••••• (ya configurada — escribe una nueva para cambiarla)' : 'Contraseña de Progreser'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          {usuarioActual && <p className="text-[11px] text-emerald-600">✓ Ya hay credenciales guardadas para el usuario &quot;{usuarioActual}&quot;.</p>}
          {mensaje && <p className="text-xs text-gray-600">{mensaje}</p>}
          <button onClick={guardar} disabled={guardando}
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
        ⚠ Esto controla un navegador automatizado que inicia sesión en Progreser con estas credenciales. Si Progreser cambia el diseño de su sitio, el llenado automático puede dejar de funcionar hasta que se actualice.
      </div>
    </div>
  )
}
